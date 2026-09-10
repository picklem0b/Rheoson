<div align="center">

<img src="web/public/assets/logo.png" width="96" height="96" style="border-radius:24px" alt="Rheoson" />

# Rheoson

**Self-hosted music. No subscription. No ads. No compromise.**

Search, stream, and download any song with a Spotify-grade interface that runs entirely on your own device or server.

[![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

[Live Demo](https://rheoson.onrender.com) · [Docs](docs/README.md) · [Report a Bug](https://github.com/picklem0b/Rheoson/issues) · [Request a Feature](https://github.com/picklem0b/RheOSon/issues)

</div>

---

## Overview

Rheoson is an open-source music application built for full ownership of your listening experience. The UI mirrors Spotify Premium — same layout, smooth spring animations, swipeable mobile player — but the audio is sourced from YouTube Music via [yt-dlp](https://github.com/yt-dlp/yt-dlp) and stored locally on your device.

Spotify's API is used **only** for metadata (titles, artwork, durations) when you paste a Spotify link. Rheoson never touches Spotify's audio.

**Offline playback is a first-class feature.** Once a track is downloaded, it plays from disk at full quality with no network activity whatsoever — no buffering, no rate limits, no YouTube.

**Accounts & sync.** Rheoson authenticates through [Clerk](https://clerk.com) (email, Google, and other providers). Likes, playlists, play history, recommendations, analytics, and cross-device playback sync are keyed to your account; the library itself (audio files) stays on your server. A local no-Clerk mode exists for fully offline single-user setups.

---

## Requirements

- Python 3.13+
- Node.js 18+ (Node 20/22 recommended)
- ffmpeg (on PATH — used by yt-dlp for audio conversion)
- MongoDB (optional but recommended — powers accounts, recommendations, analytics; the app degrades gracefully without it)

```bash
# Termux (Android)
pkg install ffmpeg python nodejs mongodb

# macOS
brew install ffmpeg node python@3.13 mongodb-community

# Debian/Ubuntu
apt install ffmpeg nodejs python3.13 mongodb
```

yt-dlp is installed automatically as a Python dependency.

---

## Quick Start

### 1 · Clone

```bash
git clone https://github.com/picklem0b/Rheoson.git
cd Rheoson
```

### 2 · Backend

```bash
cd api
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e .
# or: uv venv && uv pip install -e .

cp .env.example .env
# Fill in what you need — see "Configuration" below
```

```bash
uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload
```

> **Important:** the entry point is `app.main:socket_app`, not `app.main:app`. The plain `app` object skips the Socket.IO ASGI wrapper and silently breaks all real-time download progress.

API: `http://localhost:8000` · Swagger docs: `http://localhost:8000/api/docs`

### 3 · Frontend

```bash
cd web
npm install
npm run dev
```

App: `http://localhost:3000` — the Vite dev server proxies `/api` → `localhost:8000` automatically.

### 4 · Android app (optional)

Rheoson ships as a Capacitor Android app:

```bash
cd web
npm run build:apk          # debug APK → web/android/app/build/outputs/apk/debug/
```

Set `VITE_API_URL` in `web/.env.production` first so the APK talks to your server. CI builds a debug APK on every push to `main` (`.github/workflows/build-apk.yml`).

### 5 · Spotify (optional)

Spotify credentials unlock pasting Spotify links and higher-quality artwork. Without them, search, stream, download, playlists, and lyrics all work fully.

1. Create a free app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Copy the Client ID and Client Secret
3. In Rheoson: **Settings → Account** → paste both → Save

---

## Configuration

All backend configuration lives in `api/.env` (see `api/.env.example`). Highlights:

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENV` | `development` | `production` enables startup validation (refuses to boot without secrets) |
| `MUSIC_DIR` | `~/Rheoson/music` | Library root — the scanner and stream cache read here |
| `DOWNLOADS_DIR` | `~/Rheoson/downloads` | Download staging area |
| `MONGODB_URL` | `mongodb://localhost:27017` | MongoDB connection string |
| `CLERK_SECRET_KEY` | — | Backend JWT verification. **Required in production** |
| `CLERK_PUBLISHABLE_KEY` | — | Frontend Clerk key (`VITE_CLERK_PUBLISHABLE_KEY` in web) |
| `CLERK_WEBHOOK_SECRET` | — | Svix signing secret for `/api/webhooks/clerk` |
| `SPOTIFY_CLIENT_ID/SECRET` | — | Metadata enrichment |
| `CORS_ORIGINS` | see config | Additive extra origins beyond the built-ins |
| `RATE_LIMIT_*` | per-route | Per-IP sliding-window limits (search/download/auth/stream/lyrics) |
| `ADMIN_SUBS` | `[]` | Clerk subs allowed to mutate instance config |

Startup validation: with `ENV=production`, the API refuses to start unless `SECRET_KEY`, `CLERK_SECRET_KEY`, and `CLERK_PUBLISHABLE_KEY` are set. Misconfiguration fails loudly, never silently.

---

## How It Works

### Streaming

When a track is tapped:

1. The frontend calls `GET /api/stream/{youtube_video_id}/audio`
2. The backend checks whether the track is already downloaded locally
   - **Downloaded** → serves the file from disk with HTTP range support — instant playback, zero network
   - **Not downloaded** → a background "fill session" spawns one yt-dlp process for the track; every connected client streams from the growing buffer file. Completed buffers are promoted to a TTL-based cache (30 min, 30 tracks)
3. First audio bytes typically arrive in 1–3 seconds
4. Howler.js (`html5: true`) plays the stream without waiting for a full download

Concurrent listeners on the same track share one yt-dlp process; a client disconnecting never kills the fill. Seek requests during an in-progress fill wait for completion, then serve an exact byte range.

### Downloading

1. Submit `trackId + format + quality` to `POST /api/downloads` (or `/batch` for up to 20)
2. The job is queued and returns immediately — live progress arrives via Socket.IO
3. In the background: yt-dlp fetches best audio → ffmpeg converts → mutagen writes tags (title, artist, album, embedded artwork, synced lyrics)
4. Files land at `MUSIC_DIR/<Artist>/<Title>.<ext>` with filesystem-safe sanitization and duplicate counters (`Title (2).mp3`)
5. On completion the stream cache and track index are invalidated — the file appears in Library immediately

### Search

| Input | Behaviour |
|-------|-----------|
| Plain text | ytmusicapi → tracks, albums, artists, playlists |
| Spotify track URL | Spotify metadata → matched on YouTube Music → artwork merged |
| Spotify album / playlist / artist | Resolved track-by-track, concurrently |
| YouTube URL | video ID → ytmusicapi lookup |
| Any other URL | Passed to yt-dlp's info extractor (host allowlist enforced) |

All server-side fetches pass a **netguard**: scheme check, media-host allowlist, and DNS resolution requiring every resolved address to be public (SSRF defense). The artwork proxy separately allowlists known image CDNs.

### Scheduled Jobs

Four background cron tasks run automatically:

| Job | Schedule | Purpose |
|-----|----------|---------|
| Keep-alive ping | Every 14 min | Prevents Render free-tier sleep (prod only) |
| Library scan | Every 30 min | Invalidates track/stream caches so manually-dropped files appear |
| yt-dlp update | Daily 03:00 UTC | Keeps yt-dlp current against YouTube format changes |
| Job cleanup | Every 6 hours | Trims the in-memory download job list; sweeps stale failure entries and finished stream sessions |

---

## Features

### Player
- Stream any song — audio starts in 1–3 seconds
- Offline playback for downloaded tracks — plays from disk, zero network
- Play / pause / next / previous / shuffle / repeat (off · all · one)
- Seek slider with live timestamps · volume control + mute
- Crossfade, gapless playback, volume normalization, sleep timer
- 10-band equalizer with presets
- Like button synced with the API
- Media Session API — lock-screen and notification controls on Android
- Keyboard shortcuts (see below)
- Single Howl instance — no audio doubling or piling up
- Cross-device playback sync over Socket.IO

### Now Playing
- Fullscreen player with blurred artwork background
- Artwork scales with playback state
- Synced LRC lyrics scrolling line-by-line in time with the song
- Queue panel (playlist / lyric / related tabs)
- Offline badge on downloaded tracks
- Download current track from the player
- Swipe down to dismiss

### Library & Discovery
- Playlists, Albums, Artists with grid / list toggle
- Liked Songs pinned at the top
- Create and manage playlists; reorder tracks; import/export
- Import any Spotify playlist by URL
- Smart playlists: Most Played, Recently Added, Discover, Time Capsule
- Personalized Home: Daily Mixes, one-tap Radio, taste onboarding, dislike/hide feedback
- Wrapped: year-in-review and listening-stats dashboards

### Downloads
- Active / Queued / Saved / Errors tabs
- Live progress bar per job via Socket.IO
- Formats: MP3 · FLAC · Opus · M4A · WAV
- Quality: 128 / 192 / 256 / 320 kbps · Best
- Embed artwork and synced lyrics into downloaded files
- Retry failed jobs, cancel active jobs, batch downloads

### Search
- Instant suggestions as you type
- Full results: All / Tracks / Albums / Artists / Playlists
- Paste any Spotify, YouTube, SoundCloud, Bandcamp, or Deezer URL
- First 3 results pre-warmed in the background for faster playback start

### Settings
- 7 accent colour themes with live preview
- Dark / light surface
- Spotify credentials with connection status indicator
- Music directory management (add, browse, rescan)
- Crossfade, gapless playback, volume normalization
- Configurable download format, quality, concurrent jobs
- Navigation position (top / bottom)

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `← →` | Seek ±10 s |
| `↑ ↓` | Volume ±10% |
| `N` | Next track |
| `P` | Previous track |
| `R` | Cycle repeat mode |
| `S` | Toggle shuffle |
| `Q` | Toggle queue panel |
| `L` | Toggle lyrics |
| `M` | Mute / unmute |
| `F` | Fullscreen player |

---

## API Reference

All endpoints are prefixed with `/api` and (except the deliberately public set — health, share cards, media byte routes, the Clerk webhook) require a Clerk Bearer token. Interactive docs at `http://localhost:8000/api/docs`; a full endpoint inventory lives in [`docs/API.md`](docs/API.md).

<details>
<summary>Endpoint summary</summary>

```
# Health & meta
GET  /api/health              GET /api/health/diag (auth)
GET  /health/live             GET /health/ready
GET  /api/version

# Auth (Clerk)
POST /api/auth/register       POST /api/auth/login
POST /api/auth/logout         GET  /api/auth/me
PATCH /api/auth/me            GET  /api/auth/visitor-count
POST /api/webhooks/clerk      (Svix-signed webhook)

# Search
GET  /api/search?q=&filter=   GET  /api/search/suggest?q=
POST /api/search/resolve      { url }

# Tracks
GET  /api/tracks              GET  /api/tracks/liked
GET  /api/tracks/liked/count  GET  /api/tracks/recently-played
GET  /api/tracks/trending     GET  /api/tracks/{id}
POST /api/tracks/{id}/like    DEL  /api/tracks/{id}/like
POST /api/tracks/{id}/dislike DEL  /api/tracks/{id}/dislike
POST /api/tracks/{id}/play    DEL  /api/tracks/history
POST /api/tracks/signals      GET  /api/tracks/stats/{id}

# Stream (byte routes are public; stateful routes require auth)
GET/HEAD /api/stream/{id}/audio
GET  /api/stream/{id}/artwork
GET  /api/stream/{id}/artwork-proxy?url=
POST /api/stream/{id}/warm    POST /api/stream/cache/clear
POST /api/stream/remote-cache/clear
POST /api/stream/artwork/cache/clear

# Downloads
POST /api/downloads           GET  /api/downloads
GET  /api/downloads/{id}      POST /api/downloads/{id}/cancel
POST /api/downloads/{id}/retry  DEL  /api/downloads/{id}
POST /api/downloads/batch

# Lyrics
GET  /api/lyrics/{id}?title=&artist=

# Playlists
GET/POST /api/playlists       GET/PATCH/DEL /api/playlists/{id}
POST /api/playlists/{id}/tracks
DEL  /api/playlists/{id}/tracks/{tid}
PUT  /api/playlists/{id}/tracks/reorder
POST /api/playlists/import    POST /api/playlists/{id}/import
GET  /api/playlists/{id}/export

# Library / artists / albums
GET  /api/library/featured    GET  /api/library/albums
GET  /api/library/artists     GET  /api/library/albums/{id}
GET  /api/artists/{id}

# Recommendations & analytics
GET  /api/recommendations/home        GET /api/recommendations/autoplay
GET  /api/recommendations/discover    GET /api/recommendations/taste
GET  /api/recommendations/mixes       GET /api/recommendations/radio
POST /api/recommendations/onboard     POST /api/recommendations/refresh
GET  /api/analytics/stats             GET /api/analytics/wrapped
GET  /api/analytics/top-artists       GET /api/analytics/top-tracks
GET  /api/analytics/listening-by-hour GET /api/analytics/listening-by-day

# Smart playlists
GET  /api/smart-playlists/most-played  GET /api/smart-playlists/recently-added
GET  /api/smart-playlists/discover     GET /api/smart-playlists/time-capsule

# Equalizer
GET  /api/equalizer/presets   GET  /api/equalizer/presets/{id}

# Share
GET  /api/share/{id}/card     GET  /api/share/{id}/link

# Settings (instance)
GET/POST /api/settings/directories   GET /api/settings/directories/browse
POST /api/settings/rescan    GET  /api/settings/spotify/status
```

</details>

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  FRONTEND  (web/)                    │
│                                                      │
│  React 18 · TypeScript · Vite · Tailwind CSS        │
│  Zustand · Howler.js · Framer Motion                │
│  React Query · Socket.IO client · Capacitor (APK)   │
│  Port 3000 (dev) / static build (prod)              │
└──────────────────────────────────────────────────────┘
                    │  HTTP + WebSocket
                    ▼
┌──────────────────────────────────────────────────────┐
│                  BACKEND  (api/)                     │
│                                                      │
│  FastAPI · Python 3.13 · uvicorn · Socket.IO        │
│  Clerk JWT auth · MongoDB (Motor) · yt-dlp · ffmpeg │
│  ytmusicapi · APScheduler · mutagen · structlog     │
│  Port 8000                                          │
└──────────────────────────────────────────────────────┘
```

Deep dives: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (system design), [`docs/STREAMING.md`](docs/STREAMING.md) / [`docs/DOWNLOADS.md`](docs/DOWNLOADS.md) (pipelines), [`docs/AUTH.md`](docs/AUTH.md) (auth & security), [`docs/API.md`](docs/API.md) (endpoint reference).

---

## Deployment — Render

`render.yaml` defines both services.

**API — Python web service**

```
Build:  pip install -e .
Start:  uvicorn app.main:socket_app --host 0.0.0.0 --port $PORT --workers 1
Health: /api/health
```

Environment variables to set in the Render dashboard:

```
SECRET_KEY              (required — long random string)
CLERK_SECRET_KEY        (required)
CLERK_PUBLISHABLE_KEY   (required)
CLERK_WEBHOOK_SECRET
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
MUSIC_DIR      = /tmp/Rheoson/music
DOWNLOADS_DIR  = /tmp/Rheoson/downloads
```

**Frontend — Static site**

```
Build:   npm install && npx vite build
Publish: dist/
Env:     VITE_API_URL = <your-api-url>
```

> Render's free tier sleeps after 15 minutes of inactivity; the built-in keep-alive pinger mitigates this. For permanent downloads and persistent library data, run the API locally (e.g. Termux) and point the frontend at your server.

Docker: `docker compose up --build` (dev, hot reload) or `docker compose -f docker-compose.prod.yml up -d` (prod). Nginx reverse-proxy config included in `nginx/`.

---

## Testing & Quality

```bash
# Backend
cd api
pip install -e ".[dev]"
pytest -q                     # 99 tests: auth guard, isolation, downloads, health…
pyflakes app/                 # lint
mypy app/ --ignore-missing-imports

# Frontend
cd web
npm run typecheck             # tsc --noEmit
npm run lint                  # eslint, zero warnings
npm test                      # vitest
npm run build                 # production build + PWA service worker

# Android
cd web && npm run build:apk   # debug APK
```

The backend test suite is hermetic — no network, no real MongoDB, no real Clerk — and asserts that every stateful endpoint 401s without a session and that per-user data is isolated.

---

## Documentation

Start at **[docs/README.md](docs/README.md)** — the progressive index with the implemented/partial/planned status matrix and glossary. Quick map:

| Document | Contents |
|----------|----------|
| [docs/README.md](docs/README.md) | Progressive index + feature status matrix |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, module map |
| [docs/API.md](docs/API.md) | Full endpoint reference with request/response shapes |
| [docs/STREAMING.md](docs/STREAMING.md) | Deep dive: search → resolve → stream/warm → playback |
| [docs/DOWNLOADS.md](docs/DOWNLOADS.md) | Deep dive: job lifecycle, yt-dlp/ffmpeg, staging, retries |
| [docs/AUTH.md](docs/AUTH.md) | Deep dive: Clerk identity, tokens, webhooks, isolation, security model |
| [docs/DATA.md](docs/DATA.md) | Deep dive: MongoDB, local mirror, track identity sidecar, file layout |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Deep dive: routes, state stores, data layer, offline/PWA |
| [docs/MOBILE.md](docs/MOBILE.md) | Deep dive: Capacitor/Android builds, WebView quirks, release config |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Render, Docker, Termux, nginx, Android builds |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Runbook: health endpoints, cron jobs, troubleshooting, backups |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, test suite, codegen, conventions |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | Canonical terminology |
| [docs/SECURITY.md](docs/SECURITY.md) | Security policy and reporting |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Release history |
| [docs/PRIVACY.md](docs/PRIVACY.md) | Data handling |
| [docs/TERMS.md](docs/TERMS.md) | Terms of service |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Contribution rules and PR bar |
| [GIT_WORKFLOW.md](GIT_WORKFLOW.md) | Branches, commits, tags |

---

## Roadmap

- [x] v1.3 — Single Howl instance, offline playback, cron jobs
- [x] v2.14 — Clerk auth, per-user isolation, guest mode removal
- [x] v2.15 — Production hardening: session-backed streaming, cancellable downloads, health system
- [x] v2.16 — Discovery loop (Daily Mixes, Radio, taste onboarding), cross-device sync, Wrapped   - [x] v2.17 — Documentation overhaul, CI test gates

- [ ] v2.18 — PWA background sync improvements, Android release signing
- [ ] v3.0 — Multi-server federation, full offline PWA

---

## Licence

Apache-2.0 — see [LICENSE](LICENSE).

This licence covers the Rheoson source code only. It does not grant rights to audio content downloaded through Rheoson. You are responsible for complying with copyright law in your jurisdiction.

---

**Built by LethaboK** — [github.com/picklem0b](https://github.com/picklem0b)

> *Built in Termux on Android. Deployed on Render. Sounds like a proper server.*
