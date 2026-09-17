# Backend & API Guide — From Zero to Every Route

*Stage 6. The backend is a Python program whose whole job is: receive HTTP request → do work → return JSON. This document teaches HTTP itself, then maps every route Rheoson exposes.*

## 1. What a server is

Run `uv run uvicorn app.main:socket_app --reload` inside `api/` and your computer starts listening on port 8000. From that moment it's a *server*: it sits still until a request arrives, answers it, and waits again. Uvicorn is the runner, FastAPI is the framework that maps URLs to Python functions.

> Historical note you'll see in configs: the uvicorn target is `app.main:socket_app`, **not** `app.main:app` — Socket.IO wraps the FastAPI app and must be the outermost layer, or download progress events silently die. Never "fix" this.

## 2. HTTP in five minutes

A request has: a **method** (what you want to do), a **path** (what you want it done to), **headers** (metadata — including `Authorization` for login tokens), and sometimes a **body** (JSON data).

| Method | Meaning | Rheoson examples |
|---|---|---|
| GET | read, never changes anything | `GET /api/tracks` |
| POST | create / trigger an action | `POST /api/downloads` |
| PUT/PATCH | update | `PATCH /api/playlists/{id}` |
| DELETE | remove | `DELETE /api/tracks/{id}/like` |

A response has a **status code** and usually a JSON body:

| Code | Meaning | When you'll see it |
|---|---|---|
| 200 | OK | most GETs |
| 201/202 | created / accepted | playlist created; download queued |
| 204 | success, no body | DELETE playlist track |
| 400 | you sent something invalid | bad URL to /resolve |
| 401 | not authenticated | no/expired token on a protected route |
| 403 | authenticated but not allowed | path outside music dirs |
| 404 | doesn't exist | unknown track/playlist id |
| 422 | validation failed (FastAPI) | wrong-shaped body |
| 429 | too many requests | rate limiter |
| 5xx | server's fault | check the logs, never the client |

## 3. Anatomy of a route

```python
# api/app/routers/track_router.py (real, abridged)
@router.get("/trending", response_model=list[TrackSchema])
async def get_trending(
    limit: int = 20,                                   # query param ?limit=
    _user: dict | None = Depends(get_optional_user),   # auth dependency
):
    return await yt_trending(limit=max(1, min(limit, 50)))
```

Reading it: `GET /api/tracks/trending?limit=5` → validate `limit` → resolve the optional user → call the service → return a list of `TrackSchema`, which FastAPI serializes to JSON and documents in `/docs`.

The `Depends(...)` argument is **middleware-ish**: FastAPI runs it before the handler. `get_current_user` 401s unless a valid Clerk session token is present; `get_optional_user` returns `None` for guests (see §5).

## 4. Every route that matters

Base URL: `http://127.0.0.1:8000` in dev. **Interactive docs live at `/docs`** — every route below is clickable there with example requests.

### Search & discovery — *guest-first, no login needed*

| Route | What it does |
|---|---|
| `GET /api/search?q=…&filter=songs\|albums\|artists\|playlists` | fanout search (YouTube Music + local library) |
| `GET /api/search/categories` · `GET /api/search/categories/{slug}/top` | the browse grid; weekly-cached top 5 per category |
| `POST /api/search/resolve` `{"url": …}` | turn a YouTube/Spotify URL into tracks (SSRF-guarded) |
| `GET /api/tracks/trending` · `/trending/weekly` | charts (live) · weekly cache |
| `GET /api/library/albums` · `/artists` · `/artists/{id}` · `/albums/{id}` | aggregates from the file index or YT Music |

### Streaming — *the hot path*

| Route | What it does |
|---|---|
| `GET /api/stream/{id}/audio` | audio bytes; supports `Range` headers so seeking works; local file if cached, else CDN relay |
| `POST /api/stream/{id}/warm` | pre-buffer a remote track (same session as playback) |
| `GET /api/stream/{id}/artwork` | embedded artwork from local files |

Example — first two bytes of a track (what players do to probe):

```bash
curl -H "Range: bytes=0-1" -i http://127.0.0.1:8000/api/stream/dQw4w9WgXcQ/audio
# → HTTP/1.1 206 Partial Content … content-type: audio/mp4
```

### Tracks & history

| Route | Auth | What it does |
|---|---|---|
| `GET /api/tracks/` | guest OK | the local library |
| `GET /api/tracks/recently-played` | guest OK | device history (per user when signed in) |
| `GET /api/tracks/{id}` | guest OK | one track, local or YouTube |
| `GET/POST/DELETE /api/tracks/liked…` | **authed** | likes are account data |
| `POST /api/tracks/{id}/play` | **authed** | records in history |

### Downloads — job based

| Route | What it does |
|---|---|
| `POST /api/downloads` `{"trackId": …}` | queue a download → **202** with a job |
| `GET /api/downloads` | all jobs (progress, status) |
| `POST /api/downloads/{id}/cancel` · `/retry` | manage a job |
| `POST /api/downloads/batch` | up to 20 at once |

Progress arrives out-of-band over **Socket.IO**: `download:progress`, `download:done`, `download:error` (see §7).

### Playlists, lyrics, extras

| Route | Auth |
|---|---|
| `GET/POST /api/playlists`, `GET/PATCH/DELETE /api/playlists/{id}`, `POST …/tracks`, `GET …/export` | **authed** — playlists are per-user |
| `GET /api/lyrics/{id}?title=&artist=` | guest OK |
| `GET /api/equalizer/presets` | guest OK |
| `GET /api/share/{id}/link` · `/card` | guest OK (cards are for OG crawlers) |
| `GET /api/version`, `GET /api/health` | public |

### Accounts & admin — *strictly authed*

| Route | What it does |
|---|---|
| `POST /api/auth/register` · `/login` | Clerk-backed (rate-limited) |
| `GET /api/auth/me` · `PATCH` | profile |
| `GET/PUT /api/auth/me/preferences` | the settings-sync document |
| `GET /api/settings/directories` · `POST` · `/rescan` | instance administration |
| `GET /api/settings/backup` | export user data |
| `GET /api/health/diag` | deep diagnostics (authed) |

## 5. Auth in practice

1. Frontend signs in via Clerk (see [13](../13-infrastructure/deployment.md)).
2. Every request carries `Authorization: Bearer <token>`.
3. Backend `get_current_user` verifies the token with Clerk's API; `get_optional_user` returns `None` for guests.

**The guest-first matrix** (pinned by `api/tests/test_guest_policy.py`): search, lyrics, presets, trending, tracks, downloads and share links work anonymously; likes, playlists, recommendations, analytics, preferences and admin are account-only. A *presented but invalid* token is always a 401 — never a silent downgrade to guest.

Try it:

```bash
curl -s http://127.0.0.1:8000/api/tracks/trending | head -c 200   # guest OK
curl -s http://127.0.0.1:8000/api/tracks/liked                    # → 401
```

## 6. Validation, errors, rate limits

- **Pydantic** validates bodies/schemas; wrong shapes get FastAPI's automatic 422 with a precise field list.
- Routers raise `HTTPException(status, detail)` — that's the API's error language; the frontend's `client.api.ts` converts it into typed exceptions with the server's message.
- **Rate limiting** is per-IP-per-minute, configured in `config.py` (`RATE_LIMIT_*`); stream is generous (seeking spams range requests), auth is tight. Over the limit → 429.

## 7. WebSockets — progress without polling

HTTP is request→response; download progress needs the server to *push*. Socket.IO (over `http://127.0.0.1:8000/socket.io`) keeps a channel open; `download_service` emits progress at every stage; the frontend's `useDownloadSocket` updates the Zustand store, and rows re-render. That's the whole feature — no polling loop anywhere.

## 8. Background tasks & file handling

Downloads run as `asyncio` tasks guarded by a semaphore (`MAX_CONCURRENT_DOWNLOADS`), with yt-dlp executed in a thread executor so the event loop never blocks. Files land in `MUSIC_DIR/<Artist>/<Title>.<ext>`, get tagged (mutagen), then **two caches are invalidated** (stream cache + track index) or the new file stays invisible — the classic bug this project has fixed twice.

## 9. Cron jobs (in `main.py`)

| Job | Interval | Purpose |
|---|---|---|
| library scan | 30 min | re-index music dirs, drop stale caches |
| yt-dlp update | daily 03:00 | YouTube changes constantly; yt-dlp must keep up |
| job cleanup | 6 h | trim the job store |

## Exercises

1. Start the backend and open `/docs`. Execute `GET /api/tracks/trending` from the browser. Find the same call in `web/src/api/` — one file, which?
2. `curl` three routes as a guest: one 200, one 401, one 404. Read the JSON error shape.
3. Find `get_trending` in `track_router.py`, then the service function it calls. Why does the router clamp `limit` instead of trusting the caller?
4. Trace what happens to a `POST /api/downloads` response id on the frontend: which hook receives the Socket.IO events for it?
