# Chapter 9 — The Backend

*Part III · The Codebase*

---

The backend is one Python process with a layered interior: HTTP shells at the edge, business logic in the middle, persistence and external tools at the bottom. This chapter walks the layers, then deep-dives the three subsystems with the most moving parts — streaming, downloads, and WebSockets — and closes with the auth model and the background jobs that keep the machine honest.

## 9.1 One object to serve

Everything starts in `api/app/main.py`:

```python
app = FastAPI(...)
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)   # ← uvicorn runs THIS
```

The subtlety that has broken real deployments: the process serves `socket_app`, not `app`. Socket.IO is an ASGI wrapper *around* FastAPI; pointing uvicorn at `app` directly bypasses the wrapper, the REST API keeps working, and WebSocket events silently die — the worst kind of bug, invisible until a download progress bar never moves. Every deployment file in the repository names `socket_app` for exactly this reason (Chapter 18).

`main.py` also mounts the routers, installs CORS (the allowed origins come from config, never `*`), wires the exception handlers, and registers three background jobs (Section 9.8).

## 9.2 Routers: thin HTTP shells

A router function does three things — validate, delegate, respond — and nothing else:

```python
# api/app/routers/track_router.py (abridged)
@router.get("/{track_id}", response_model=TrackSchema)
async def get_track(track_id: str, user: User | None = Depends(get_optional_user)):
    return await track_service.get(track_id)
```

Reading the decorator is reading the endpoint: path, method, response model. The function body delegates to a **service** — the router holds no business logic by rule, which keeps the HTTP layer boring and swappable and lets tests call services directly (Chapter 16). Path/query parameters are typed in the signature; FastAPI parses, coerces, and rejects bad input with a 422 before the body ever runs.

Route order is load-bearing: static paths (`/liked`, `/recently-played`) are registered *before* the parameterized `/{track_id}`, or FastAPI matches `"liked"` as an ID. This has bitten the codebase once and is pinned by tests now — a review check whenever a new route joins an existing router.

## 9.3 Services: the actual logic

Each service module owns one domain:

| Module | Owns |
|---|---|
| `download_service.py` | job lifecycle, yt-dlp orchestration, tagging, cache invalidation |
| `ytmusic_service.py` | the YouTube Music wrapper — singleton, executor offload, failure recovery |
| `search_service.py` | query classification, search fanout, URL resolution, prewarm |
| `metadata_service.py` | mutagen tag read/write, `_file_id()` — the local track identity |
| `lyrics_service.py` | synced lyrics fetch and LRC parsing |
| `artwork_service.py` | embedded artwork extraction |
| `stream_service.py` | the audio relay and durable cache (Section 9.5) |

Two patterns govern them all. **The singleton with failure memory** (`ytmusic_service.py`): one client instance guarded by a lock, created lazily; once it fails, an error flag makes every call fail fast — no retry storm hammering a sick dependency — until a backoff window elapses and recovery is attempted. **Executor offload** (6.4): every blocking call from the YTMusic and file-system worlds crosses into a thread pool, keeping the event loop responsive.

The identity contract lives here and is the single most sensitive function in the codebase: `_file_id()` hashes a file's absolute path to sixteen hex characters, and that hash *is* the local track ID — stream URLs, likes, history, and playlists all key off it. Changing it orphans every stored reference, which is why the function is documented as frozen and tested against drift.

## 9.4 The search path

`search_service.py` classifies the query, then dispatches:

- **Plain text** → fan out to the YouTube Music library concurrently (`asyncio.gather` across songs/albums/artists/playlists), merge, and optionally search the local library in parallel.
- **A URL** → resolve by host: YouTube IDs directly; Spotify links via the Spotify service (which matches against YouTube results under a concurrency semaphore); anything else to yt-dlp's generic extractor.

After returning results, the service *prewarms*: it fires lightweight requests against the stream route for the top hits so their resolve-and-cache work is already done before the user taps play. The design goal is stated in one line — the stream route should never do cold resolve work at playback time (Section 9.5 shows the payoff).

## 9.5 Streaming: the two-tier route

`stream_router.py` serves every byte of audio, and its contract explains the app's playback feel:

```
GET /api/stream/{id}/audio
        │
        ├─ local file known (durable cache / library scan)?
        │       └─ YES → serve from disk with Range support (206)
        │
        └─ NO → resolve with yt-dlp → relay the CDN's bytes upstream
                ├─ forward the client's Range header
                ├─ pass through Content-Length / Content-Range untouched
                └─ tee the bytes into the durable cache as they flow
```

Three decisions in that flow carry the weight:

**Range requests are first-class.** Every audio element opens with `Range: bytes=0-`; seeking issues mid-file ranges. A server that buffers the whole response before answering turns both into silence — a real past bug, fixed by treating `bytes=0-` as a normal range and relaying immediately. The relay passes the CDN's own headers through untouched so durations and seek targets stay exact.

**The durable cache.** Bytes streamed once are teed to disk; the next play of the same track is a local file serve with a sub-second first byte. The cache is invalidated when the library changes and scanned lazily — Chapter 10 tabulates where it lives.

**Optimistic HEAD.** A `HEAD` request can return length and type before any resolve work, so the player learns the track's shape instantly. The frontend's format-hint logic (Chapter 12) depends on it.

## 9.6 Downloads: a job system

`download_service.py` runs a small job system inside the process:

```
POST /api/downloads {id}
  → enqueue: resolve URL, create job dict, spawn asyncio task
  → _run_download: acquire semaphore (MAX_CONCURRENT_DOWNLOADS)
      yt-dlp with a player-client ladder — try each client variant
      until one yields a format, rather than dying on the first refusal
  → tag: metadata_service writes tags, embeds artwork/lyrics
  → finish: invalidate stream cache + track index, emit download:done
```

The mechanics worth knowing cold: the **semaphore** bounds concurrent yt-dlp processes so twenty requests cannot exhaust a phone's resources; the **client ladder** exists because YouTube refuses individual extraction clients unpredictably — trying variants (default, android, tv_embedded, …) against a permissive format selector converts most one-client refusals into success; **progress hooks** run inside yt-dlp's thread and are marshaled back onto the event loop to emit Socket.IO events; and **invalidation** is a chain, not an option — a finished download that skips invalidating both caches produces a track invisible to the library until restart, a bug class the tests now pin.

Job state is in-memory (fast, per-connection progress) with completed and failed jobs persisted to disk — the "in memory versus on disk" split from Chapter 1.3 applied exactly where it pays.

## 9.7 WebSockets: push, not poll

The Socket.IO layer is two small files and one discipline. Backend: a connection manager wraps the server singleton, buffers events emitted before startup completes, and exposes typed emitters (`emit_download_progress/done/error`). Frontend: one lazily-connected, reference-counted socket with a handler registry that deduplicates subscriptions across re-renders (Chapter 8.5). Events are broadcast, not room-targeted — correct for a single-user self-hosted app, and a listed limitation for any future multi-user deployment.

The rule for choosing a channel: anything the *user asked for* is HTTP; anything the *server needs to volunteer* is a push event. Progress bars and health pings are the second kind.

## 9.8 Background jobs and housekeeping

APScheduler runs three cron jobs inside the process: a **library scan** (every 30 minutes — rebuilds the track index and stream cache after any out-of-band file changes), a **yt-dlp self-update** (daily — the extractor races YouTube's changes, and staleness here is the leading cause of "downloads stopped working"), and a **job cleanup** (trims the in-memory job table). Each job calls the same invalidation functions the download pipeline uses, so cron and downloads cannot disagree about cache state.

## 9.9 Authentication and the guest-first policy

Auth is Clerk-based and deliberately layered:

```
Authorization: Bearer <JWT>
  → get_optional_user: verify signature+expiry; valid → user; invalid → 401; absent → None
  → get_current_user: get_optional_user, then 401 if None
```

The policy matrix that every endpoint encodes, and that the test suite pins endpoint by endpoint:

| Access class | Endpoints | Rule |
|---|---|---|
| Guest-first (read + act) | search, stream, lyrics, trending, categories, downloads (own jobs) | anonymous works; a *bad* token still 401s |
| Account-required | playlists, preferences, recommendations, analytics | `get_current_user`; 401 without |
| Instance-admin | rescan, backups, log access, diagnostics | strict identity + role check |

The subtlety with real incident history: "no token → guest" must never silently swallow a *presented but invalid* token — that converts an expired session into a mysterious guest experience. The 401/403 distinction from Chapter 3.2 is the contract: 401 "no valid identity," 403 "identity valid, permission absent."

Identity is propagated by the backend verifying the JWT on every protected call — the frontend's token is a claim, never a fact — and webhooks from the auth provider are verified against their signing secret before any user record changes on their account.

## 9.10 Hardening the input surface

Endpoints that accept URLs (`/downloads`, `/search/resolve`) accept *hostile* input by definition, and the hardening follows one principle: resolve first, judge the destination, then fetch. Schemes are limited to http/https; resolved addresses are checked against private and link-local ranges so a "video URL" cannot be a probe of the server's own network; redirects are re-validated at each hop; and extraction runs with yt-dlp's own sandboxing flags. The rate limiter sits in front of all of it — in-process by default, Redis-backed when configured — with the general lesson stated plainly: any endpoint whose cost is unbounded (search fanout, downloads, resolve) is rate-limited, not trusted.

## Exercises

1. A deployment "works but download progress never moves." Using only this chapter, name the misconfiguration and the line in every deploy file that prevents it.
2. Find the client ladder in `download_service.py`. What selector does it pass, and why would a strict selector defeat the ladder's purpose?
3. Explain the two-tier stream route's cold-path cost and the prewarm's relationship to it, as a sequence of first requests a user would feel.
4. Write the three-line summary of the guest policy matrix a reviewer would check a new endpoint against.
5. The invalidation chain: list what becomes stale if `invalidate_track_index()` fires but the stream cache is not invalidated after a download, and vice versa.
