# Rheoson API Reference

Base URL: `http://localhost:8000` (dev) · your deployed origin (prod).
Interactive Swagger UI: **`/api/docs`** · OpenAPI JSON: `/api/openapi.json`.

All request/response bodies are JSON unless noted. Durations are seconds (float). Track IDs are 11-character YouTube video IDs unless the endpoint documents a local file ID.

---

## Authentication

Rheoson uses [Clerk](https://clerk.com) session JWTs.

- Send `Authorization: Bearer <jwt>` on every request.
- Tokens are short-lived (~60 s); the frontend fetches a fresh one from Clerk per request burst via `getToken()`.
- The backend verifies the RS256 signature against Clerk's JWKS (`https://api.clerk.com/v1/jwks`), checks `exp`/`nbf`, and requires an `iss` under `clerk.accounts.dev` / `clerk.dev` / `clerk.com`.
- The canonical user key in every handler is the `sub` claim (a Clerk user ID like `user_2abc…`).

**Local dev mode:** with `ENV=development` *and* Clerk unconfigured, the API issues a synthetic `dev-user-local` identity so you can develop without Clerk. The moment `CLERK_SECRET_KEY` is set (or `ENV=production`), this fallback disappears and unauthenticated calls fail closed with `401`.

### Error responses

| Status | Meaning |
|--------|---------|
| `401` | Missing/invalid/expired token, or auth not configured |
| `403` | Webhook signature invalid |
| `404` | Resource not found (or not visible to this user) |
| `422` | Request body/query validation failure (Pydantic) |
| `429` | Rate limited — includes `Retry-After` header |
| `502` | Upstream (YouTube/Spotify/lyrics provider) failure |
| `503` | MongoDB unavailable, or webhook secret unset |

Error body shape: `{ "detail": "human-readable message" }`.

### Rate limits

Per IP, sliding 60-second window, applied by path prefix. Defaults (tune via `RATE_LIMIT_*` env):

| Prefix | Limit/min |
|--------|-----------|
| `/api/search` | 30 |
| `/api/downloads` | 10 |
| `/api/auth` | 20 |
| `/api/stream` | 300 (audio seeking issues many range requests) |
| `/api/lyrics` | 60 |

Exceeding a limit returns `429` with `Retry-After` seconds.

### Public endpoints (no auth)

Deliberately public, validated by resource shape:

- `GET /api/health`, `GET /health/live`, `GET /health/ready`, `GET /api/version`
- `GET /api/share/{track_id}/card` — share image card
- `GET/HEAD /api/stream/{id}/audio` and the artwork routes — `<audio>`/`<img>` elements cannot attach headers; these are read-only byte streams for validated resource IDs
- `POST /api/webhooks/clerk` — verified by Svix HMAC signature instead

---

## Health & meta

### `GET /api/health`
Cheap full snapshot backed by a 60 s background probe. No auth.

```json
{
  "status": "ok",
  "version": "2.16.4",
  "env": "production",
  "uptime": "03:12:44",
  "uptimeS": 11564,
  "python": "3.13.1",
  "memory": { "rss_mb": 184.2 },
  "services": { "mongodb": true, "clerk": true, "redis": false, "spotify": true },
  "downloads": { "total": 4, "by_status": { "done": 4 } },
  "keep_alive": { "last_ping": "…", "last_status": 200, "last_latency_ms": 187, "total_pings": 41, "total_failures": 0 },
  "cron_jobs": [ { "id": "keep_alive", "next_run": "…" } ]
}
```

### `GET /api/health/diag` (auth)
Deep diagnostics on demand: fresh DB ping with latency, yt-dlp/ffmpeg versions, config validation, recent 5xx ring and latency percentiles.

### `GET /health/live`, `GET /health/ready`
Kubernetes/Render-style liveness (zero I/O) and readiness (fast storage probe). `GET /api/version` returns `{ "version", "name", "releaseDate" }`.

---

## Auth endpoints

### `POST /api/auth/login`
Authenticates through Clerk's Backend API (used by local/no-JS clients).

```json
{ "email": "you@example.com", "password": "••••" }
```

- `201` → `{ "token": "<jwt>", "user": { … } }`
- `401` on unknown credentials (fail closed, same shape as invalid token)
- `422` on malformed payloads

### `POST /api/auth/register`
Creates the account via Clerk Backend API and immediately creates a session. Same response shape as login. `20/min` rate limit — this fronts account creation.

### `GET /api/auth/me` (auth)
Returns the synced user record: `{ "id", "email", "name", "image_url", "created_at", "preferences", "stats" }`.

### `PATCH /api/auth/me` (auth)
Updates profile fields (`name`, `image_url`) and preference keys (`theme`, `audio_format`, `audio_quality`, …).

### `POST /api/auth/logout` (auth)
Revokes the Clerk session server-side. `{"ok": true}`.

### `GET /api/auth/visitor-count` (auth)
Aggregate visitor counter from the `visitors` collection.

---

## Search

### `GET /api/search?q=<query>&filter=<tracks|songs|albums|artists|playlists>` (auth)

Unified search. Plain text goes to ytmusicapi; URLs are detected and routed (Spotify → metadata + match; YouTube → lookup; anything else → yt-dlp). Queries are sanitized (control characters stripped, 200-char cap) and `filter` is pattern-validated.

Response (`SearchResultsSchema`):

```json
{
  "query": "daft punk",
  "type": "search",
  "tracks":  [ { TrackSchema } ],
  "albums":  [ … ],
  "artists": [ … ],
  "playlists": [ … ]
}
```

Track shape (used everywhere in the API):

```json
{
  "id": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "artist": { "id": "UCuAX…", "name": "Rick Astley", "imageUrl": "", "genres": [] },
  "album": { "id": "", "title": "", "artworkUrl": "", "releaseYear": 0, "trackCount": 0, "artist": { … } },
  "artworkUrl": "https://i.ytimg.com/…",
  "duration": 212.0,
  "streamUrl": "/api/stream/dQw4w9WgXcQ/audio",
  "isDownloaded": false,
  "isLiked": false,
  "youtubeId": "dQw4w9WgXcQ"
}
```

`isDownloaded`/`isLiked` are hydrated server-side from the local library and the caller's per-user store.

### `GET /api/search/suggest?q=<prefix>` (auth)
Instant autocomplete strings (~80 ms). Returns `[]` under 2 characters.

### `POST /api/search/resolve` (auth)

```json
{ "url": "https://open.spotify.com/track/…" }
```

Resolves any supported media URL into a full search result. Enforced by netguard:

1. `http`/`https` only, no embedded credentials, no exotic ports, ≤ 2048 chars
2. Host on the media allowlist (youtube, youtu.be, googlevideo, spotify, scdn, soundcloud, sndcdn, bandcamp, bcbits, deezer, tidal, music.apple, itunes, mzstatic, vimeo, twitch, jtvnw, mixcloud, audiomack, reverbnation, apple, ytimg)
3. Hostname must resolve **only** to public IPs — loopback/private/link-local/metadata addresses are rejected (SSRF defense)

`400` with a reason for violations. `502` when the upstream extractor fails.

---

## Tracks

All routes below require auth. Likes and history are **per user** — every query/filter includes the caller's `sub`, so one user's data is invisible to another (enforced by tests).

| Endpoint | Description |
|----------|-------------|
| `GET /api/tracks` | Full local library index (file-backed). Each track hydrated with `isDownloaded`, artwork, metadata |
| `GET /api/tracks/liked` | Caller's liked tracks |
| `GET /api/tracks/liked/count` | `{ "count": n }` |
| `GET /api/tracks/recently-played` | Caller's play history, newest first |
| `GET /api/tracks/trending` | Popular tracks (global fallback when no history) |
| `GET /api/tracks/{id}` | Single track by YouTube ID or local file ID |
| `POST /api/tracks/{id}/like` | Like (idempotent) |
| `DELETE /api/tracks/{id}/like` | Unlike (idempotent) |
| `POST /api/tracks/{id}/dislike` | Negative signal — feeds recommendations and radio filtering |
| `DELETE /api/tracks/{id}/dislike` | Remove dislike |
| `POST /api/tracks/{id}/play` | Record a play event (history + recommendation signals) |
| `DELETE /api/tracks/history` | Clear caller's history |
| `POST /api/tracks/signals` | Explicit signal ingest: `{ "signal": "play\|like\|dislike\|skip", "track_id": "…" }` |
| `GET /api/tracks/stats/{id}` | Per-track stats for the caller |
| `DELETE /api/tracks/history` | Clear history |

---

## Streaming

### `GET /api/stream/{track_id}/audio`

The core playback route. Also answers `HEAD` (durations/probes). Public by design (see [Authentication](#authentication)).

Resolution order:

1. **Local library** — track ID exists in the file index → served from disk with full HTTP byte-range support (`206 Partial Content`, `Accept-Ranges: bytes`), correct MIME per container (mp3/flac/m4a/ogg/opus/wav)
2. **Durable remote cache** — a previous yt-dlp fill completed within the 30-minute TTL → served from the cached buffer file
3. **Live session** — one background yt-dlp fill per track (max 6 concurrent); all clients stream from the growing buffer. Seek (`Range`) requests during an in-progress fill wait up to 120 s for completion, then serve the exact range
4. `502` with a user-safe message on failure; repeated failures are cached for 60 s so retry storms don't spawn processes

Malformed IDs (length ≠ 11) return `404` before any process spawn.

### `POST /api/stream/{track_id}/warm` (auth)
Idempotent background warm-up: starts the shared fill without streaming. Returns `{"ok": true, "state": "local|cached|warming|failed|busy"}`.

### `GET /api/stream/{track_id}/artwork`
Embedded artwork from a locally downloaded file. `204` when downloaded but artless, `404` when not downloaded.

### `GET /api/stream/{track_id}/artwork-proxy?url=<https-url>`
Artwork proxy. In-memory cache (500 entries, LRU) + 24 h client cache. **Allowlist-enforced** (i.ytimg.com, yt3.ggpht.com, googleusercontent, scdn.co, spotifycdn…) — any other host returns `400`. Only `https`.

### Cache management (auth)
`POST /api/stream/cache/clear` (file index) · `POST /api/stream/remote-cache/clear` (yt-dlp buffers) · `POST /api/stream/artwork/cache/clear` (proxy cache).

---

## Downloads

All routes require auth. Jobs are in-memory + JSON-persisted; the queue trims to the most recent 100 every 6 hours.

### `POST /api/downloads`

```json
{
  "trackId": "dQw4w9WgXcQ",        // or "url": "https://…"
  "format": "mp3",                  // mp3|flac|opus|m4a|wav
  "quality": "320",                 // 128|192|256|320|best
  "embedArtwork": true,
  "embedLyrics": true,
  "embedMetadata": true,
  "fileNaming": "artist-title",     // artist-title|title-artist|id
  "customPath": "/abs/path",        // optional; MUST resolve inside a configured music dir
  "retries": 3,
  "speedLimit": 0,                  // KB/s, 0 = unlimited
  "concurrency": 3
}
```

`202 Accepted` → `DownloadJobSchema`:

```json
{
  "id": "uuid", "trackId": "…", "title": "…", "artist": "…", "artworkUrl": "…",
  "status": "downloading", "progress": 12.5, "format": "mp3", "quality": "320",
  "error": null, "filePath": null, "createdAt": "2026-09-10T12:00:00+00:00"
}
```

Status flow: `queued → downloading → tagging → done`, or `cancelled`/`failed`. Progress events are pushed over Socket.IO (`download:progress`, `download:done`, `download:error`).

Validation: `trackId` ≤ 20 chars; URLs pass netguard; `customPath` must resolve inside a configured music directory (defense against arbitrary file writes — checked in both router and service).

### `POST /api/downloads/batch`
Same options, `{"track_ids": [...]}` (max 20). Returns a list of jobs; invalid IDs are skipped.

### Job management
`GET /api/downloads` (list, newest first) · `GET /api/downloads/{id}` · `POST /api/downloads/{id}/cancel` (SIGTERM → SIGKILL the process group; partial files removed) · `POST /api/downloads/{id}/retry` (replays the original options) · `DELETE /api/downloads/{id}` (drops the record).

Job IDs are UUID-format-validated (`400` otherwise).

---

## Lyrics

### `GET /api/lyrics/{track_id}?title=&artist=` (auth)

Returns synced (LRC) and/or plain lyrics from the provider chain (syncedlyrics → ytmusicapi), with local metadata fallback:

```json
{ "synced": true, "lines": [ { "time": 12.4, "text": "…" } ], "plain": "…" }
```

`404` when no provider has lyrics. Provider failures degrade to the next source; `502` only when everything failed and the failure was upstream.

---

## Playlists

All routes require auth; playlists are **per user**. Playlist IDs are server-generated; foreign IDs 404 (ownership is checked on every access, not just listing — covered by tests).

| Endpoint | Description |
|----------|-------------|
| `GET /api/playlists` | Caller's playlists |
| `POST /api/playlists` | Create: `{ "title", "description?", "artworkUrl?" }` → `201` |
| `GET /api/playlists/{id}` | Playlist with hydrated tracks |
| `PATCH /api/playlists/{id}` | Rename / re-artwork |
| `DELETE /api/playlists/{id}` | `204`; idempotent (deleting another user's playlist is still `204` but deletes nothing) |
| `POST /api/playlists/{id}/tracks` | `{ "trackId" }` or full track object; deduplicates |
| `DELETE /api/playlists/{id}/tracks/{track_id}` | Remove |
| `PUT /api/playlists/{id}/tracks/reorder` | `{ "from": 0, "to": 2 }` or full order array |
| `POST /api/playlists/import` | `{ "url": "<spotify playlist url>" }` → creates a playlist from matched tracks |
| `POST /api/playlists/{id}/import` | Append imported tracks to an existing playlist |
| `GET /api/playlists/{id}/export` | JSON export |

---

## Library, albums & artists

| Endpoint | Description |
|----------|-------------|
| `GET /api/library/featured?limit=` | Pinned playlists for the home rail |
| `GET /api/library/albums` | Album aggregates from the local index |
| `GET /api/library/albums/{album_id}?name=` | Remote (YouTube Music browse ID) **or** local aggregate by md5/slug/name |
| `GET /api/library/artists` | Artist aggregates |
| `GET /api/artists/{artist_id}?name=` | Remote artist profile + top tracks, or local aggregate |

Local aggregates work fully offline from the file index.

---

## Recommendations

All require auth. Signals are stored in MongoDB (`user_signals`, `taste_profiles`, `user_recommendations`) — these endpoints `503` without a database.

| Endpoint | Description |
|----------|-------------|
| `GET /api/recommendations/home` | Personalized home rails (mixes, discovery, because-you-liked) |
| `GET /api/recommendations/autoplay` | Next-track suggestion seeded by the current track |
| `GET /api/recommendations/discover` | Discovery loop items with dislike/hide feedback |
| `GET /api/recommendations/taste` | Taste profile + `cold_start` flag (drives onboarding) |
| `GET /api/recommendations/mixes` | Daily Mixes |
| `GET /api/recommendations/radio?track_id=` | One-tap radio seeded from a track |
| `POST /api/recommendations/onboard` | `{ "artists": ["A", "B", "C"] }` — seeds taste (max 3 enforced) |
| `POST /api/recommendations/refresh` | Recompute the profile from accumulated signals |

---

## Analytics & smart playlists

| Endpoint | Description |
|----------|-------------|
| `GET /api/analytics/stats` | Totals: plays, minutes, unique tracks, streaks |
| `GET /api/analytics/wrapped` | Year-in-review payload (top artists/tracks, listening clock) |
| `GET /api/analytics/top-artists?limit=` | Aggregated by plays |
| `GET /api/analytics/top-tracks?limit=` | Aggregated by plays |
| `GET /api/analytics/listening-by-hour` | 24-bucket histogram |
| `GET /api/analytics/listening-by-day` | Day-of-week histogram |
| `GET /api/smart-playlists/most-played\|recently-added\|discover\|time-capsule` | Virtual playlists, computed per request |

---

## Equalizer & share

`GET /api/equalizer/presets` — the 10-band preset catalog (Flat, Bass Boost, Vocal, …). `GET /api/equalizer/presets/{id}` — one preset.

`GET /api/share/{track_id}/link` (auth) — canonical share URL. `GET /api/share/{track_id}/card?title=&artist=` — **public** OG-image card (SVG) for link previews.

---

## Instance settings (admin)

| Endpoint | Description |
|----------|-------------|
| `GET /api/settings/directories` | Configured + discovered music dirs |
| `POST /api/settings/directories` | Add a directory (path-validated; restricted to `ADMIN_SUBS` when set) |
| `GET /api/settings/directories/browse?path=` | Sandbox-bound directory browser |
| `POST /api/settings/rescan` | Force library + stream cache invalidation |
| `GET /api/settings/spotify/status` | Whether Spotify metadata is configured |

---

## Webhook

### `POST /api/webhooks/clerk`
Clerk user lifecycle sync (created/updated/deleted, session.created). Security, in order:

1. `503` if `CLERK_WEBHOOK_SECRET` is unset — never accepts unverified events
2. Svix headers required (`svix-id`, `svix-timestamp`, `svix-signature`)
3. Timestamp freshness: ±5 minutes
4. HMAC-SHA256 over `"{id}.{timestamp}.{body}"` with the base64-decoded secret, constant-time compared against every `v1,…` entry

Handled events upsert/soft-delete the `users` document keyed by the Clerk ID. Always returns `200` after verification (failures inside handlers are logged, not retried by Clerk).

---

## WebSocket (Socket.IO)

Endpoint: same origin as the API (`/socket.io`), CORS-restricted to the same allowlist as HTTP.

| Event (server → client) | Payload | When |
|--------------------------|---------|------|
| `download:progress` | `{ "job_id", "progress", "status" }` | Every meaningful chunk |
| `download:done` | `{ "job_id", "file_path" }` | Download + tagging finished |
| `download:error` | `{ "job_id", "error" }` | Failure or cancellation |
| `player:state` | Player snapshot | Cross-device sync (broadcast to the account's other sessions) |
| `pong` | `{ "sid" }` | Heartbeat reply |

The client auto-reconnects with backoff; the frontend re-fetches download state on reconnect so no event is structurally required to succeed.
