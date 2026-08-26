<div align="center">

<img src="web/public/assets/logo.png" width="96" height="96" style="border-radius:24px" alt="Shulker" />

# Shulker

**Self-hosted music. No subscription. No ads. No compromise.**

Search, stream, and download any song with a Spotify-grade interface that runs entirely on your own device or server.

[![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.103+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Live Demo](https://shulker.onrender.com) · [Report a Bug](https://github.com/picklem0b/shulker/issues) · [Request a Feature](https://github.com/picklem0b/shulker/issues)

</div>

---

## Overview

Shulker is an open-source music application built for full ownership of your listening experience. The UI mirrors Spotify Premium — same layout, smooth spring animations, swipeable mobile player — but the audio is sourced from YouTube Music via [yt-dlp](https://github.com/yt-dlp/yt-dlp) and stored locally on your device.

Spotify's API is used **only** for metadata (titles, artwork, durations) when you paste a Spotify link. Shulker never touches Spotify's audio.

**Offline playback is a first-class feature.** Once a track is downloaded, it plays from disk at full quality with no network activity whatsoever — no buffering, no rate limits, no YouTube.

---

## Screenshots

| Home | Now Playing | Downloads |
|------|-------------|-----------|
| ![home](docs/screenshots/home.png) | ![now-playing](docs/screenshots/nowplaying.png) | ![downloads](docs/screenshots/downloads.png) |

---

## Requirements

- Python 3.13+
- Node.js 18+
- ffmpeg

```bash
# Termux (Android)
pkg install ffmpeg python nodejs

# macOS
brew install ffmpeg node python@3.13

# Debian/Ubuntu
apt install ffmpeg nodejs python3.13
```

yt-dlp is installed automatically as a Python dependency.

---

## Quick Start

### 1 · Clone

```bash
git clone https://github.com/picklem0b/shulker.git
cd shulker
```

### 2 · Backend

```bash
cd api
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e .

cp .env.example .env
# Optional: set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env

uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload
```

API: `http://localhost:8000`  
Swagger docs: `http://localhost:8000/api/docs`

### 3 · Frontend

```bash
cd web
npm install
npm run dev
```

App: `http://localhost:3000`  
The Vite dev server proxies `/api` → `localhost:8000` automatically.

### 4 · Spotify (optional)

Spotify credentials unlock pasting Spotify links and enable higher-quality artwork. Without them, search, stream, download, playlists, and lyrics all work fully.

1. Create a free app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Copy the Client ID and Client Secret
3. In Shulker: **Settings → Account** → paste both → Save

---

## How It Works

### Streaming

When a track is tapped:

1. The frontend calls `/api/stream/{youtube_video_id}/audio`
2. The backend checks whether the track is already downloaded locally
   - **Downloaded** → serves the file from disk with HTTP range support — instant playback, zero network
   - **Not downloaded** → pipes audio from yt-dlp stdout directly through the HTTP response
3. First audio bytes arrive in 1–3 seconds
4. Howler.js (`html5: true`) plays the stream without waiting for a full download

A single global Howl instance ensures there is never more than one audio source active at a time.

### Downloading

1. Submit `trackId + format + quality` to `POST /api/downloads`
2. The job is queued and returns immediately — live progress appears in the Downloads tab
3. In the background:
   - yt-dlp fetches the best available audio
   - ffmpeg converts to the chosen format (MP3 / FLAC / Opus / M4A / WAV)
   - mutagen writes ID3 tags: title, artist, album, embedded artwork, synced lyrics
   - File is saved to `MUSIC_DIR/<Artist>/<Title>.<ext>`
4. On completion, the stream cache and track index are invalidated — the file appears in Library on the very next request, no restart required

### Search

| Input | Behaviour |
|-------|-----------|
| Plain text | Calls ytmusicapi → tracks, albums, artists, playlists |
| Spotify track URL | Fetches Spotify metadata → matches on YouTube Music → merges artwork |
| Spotify album / playlist | Resolves every track concurrently |
| YouTube URL | Extracts video ID → fetches via ytmusicapi |
| Any other URL | Passes directly to yt-dlp info extractor |

### Scheduled Jobs

Three background cron tasks run automatically:

| Job | Schedule | Purpose |
|-----|----------|---------|
| Library scan | Every 30 min | Invalidates track and stream caches so manually-dropped files appear without a restart |
| yt-dlp update | Daily at 03:00 UTC | Keeps yt-dlp current against YouTube format changes |
| Job cleanup | Every 6 hours | Trims the in-memory download job list to 100 entries; removes references to deleted files |

---

## Features

### Player
- Stream any song — audio starts in 1–3 seconds
- Offline playback for downloaded tracks — plays from disk, zero network
- Play / pause / next / previous / shuffle / repeat (off · all · one)
- Seek slider with live timestamps
- Volume control + mute
- Like button synced with the API
- Media Session API — lock screen and notification controls on Android
- Keyboard shortcuts
- Single Howl instance — no audio doubling or piling up

### Now Playing
- Fullscreen player with blurred artwork background
- Artwork scales with playback state
- Synced LRC lyrics scrolling line-by-line in time with the song
- Queue panel (playlist / lyric / related tabs)
- Offline badge on downloaded tracks
- Download current track from the player
- Swipe down to dismiss

### Library
- Playlists, Albums, Artists with grid / list toggle
- Liked Songs pinned at the top
- Create and manage playlists
- Import any Spotify playlist by URL

### Downloads
- Active / Queued / Saved / Errors tabs
- Live progress bar per job via WebSocket
- Format: MP3 · FLAC · Opus · M4A · WAV
- Quality: 128 / 192 / 256 / 320 kbps · Best
- Embed artwork and synced lyrics into downloaded files
- Retry failed jobs, cancel active jobs

### Search
- Instant suggestions as you type (80ms debounce)
- Full results: All / Tracks / Albums / Artists / Playlists
- Paste any Spotify, YouTube, SoundCloud, Bandcamp, or Deezer URL
- First 3 results pre-resolved in the background for faster playback start

### Settings
- 7 accent colour themes with live preview
- Dark / light surface
- Spotify credentials with connection status indicator
- Music directory management
- Crossfade, gapless playback, volume normalisation
- Configurable download format, quality, concurrent jobs

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

All endpoints are prefixed with `/api`. Interactive docs at `http://localhost:8000/api/docs`.

<details>
<summary>Endpoints</summary>

```
GET  /api/health

GET  /api/search?q=&filter=
GET  /api/search/suggest?q=
POST /api/search/resolve           { url }

GET  /api/tracks
GET  /api/tracks/liked
GET  /api/tracks/liked/count
GET  /api/tracks/recently-played
GET  /api/tracks/trending
GET  /api/tracks/{id}
POST /api/tracks/{id}/like
DEL  /api/tracks/{id}/like
POST /api/tracks/{id}/play
DEL  /api/tracks/history

GET  /api/stream/{id}/audio
HEAD /api/stream/{id}/audio
GET  /api/stream/{id}/artwork

POST /api/downloads
GET  /api/downloads
GET  /api/downloads/{id}
POST /api/downloads/{id}/cancel
POST /api/downloads/{id}/retry
DEL  /api/downloads/{id}

GET  /api/lyrics/{id}?title=&artist=

GET   /api/playlists
POST  /api/playlists
GET   /api/playlists/{id}
PATCH /api/playlists/{id}
DEL   /api/playlists/{id}
POST  /api/playlists/{id}/tracks
DEL   /api/playlists/{id}/tracks/{tid}
PUT   /api/playlists/{id}/tracks/reorder
POST  /api/playlists/import

GET  /api/library/featured
GET  /api/library/albums
GET  /api/library/artists

POST /api/settings/spotify
GET  /api/settings/spotify/status
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
│  Port 3000                                          │
└──────────────────────────────────────────────────────┘
                    │  HTTP + WebSocket
                    ▼
┌──────────────────────────────────────────────────────┐
│                  BACKEND  (api/)                     │
│                                                      │
│  FastAPI · Python 3.13 · uvicorn · Socket.IO        │
│  yt-dlp · ffmpeg · ytmusicapi · APScheduler        │
│  mutagen · structlog                                │
│  Port 8000                                          │
└──────────────────────────────────────────────────────┘
```

---

## Deployment — Render

`render.yaml` defines both services.

**API — Python web service**

```
Build:  pip install -e .
Start:  uvicorn app.main:socket_app --host 0.0.0.0 --port $PORT
```

Environment variables to set in the Render dashboard:

```
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
MUSIC_DIR      = /tmp/shulker/music
DOWNLOADS_DIR  = /tmp/shulker/downloads
```

**Frontend — Static site**

```
Build:   npm install && npx vite build
Publish: dist/
```

> Render's free tier sleeps after 15 minutes of inactivity. The first request after sleep takes ~30 s. For permanent downloads and persistent library data, run the API locally on Termux and point the frontend at your local IP.

---

## Themes

| Theme | Accent |
|-------|--------|
| Crimson (default) | `#E5193A` |
| Rose | `#F43F5E` |
| Orange | `#F97316` |
| Violet | `#8B5CF6` |
| Cyan | `#06B6D4` |
| Green | `#22C55E` |
| Gold | `#EAB308` |

Theme is written to `localStorage` and applied before first paint — no flash of wrong theme on load.

---

## File Structure

```
shulker/
├── README.md
├── CHANGELOG.md
├── render.yaml
├── docs/
│   ├── PRIVACY.md
│   ├── TERMS.md
│   ├── SECURITY.md
│   └── CONTRIBUTING.md
│
├── api/
│   ├── pyproject.toml
│   ├── .env.example
│   └── app/
│       ├── main.py              FastAPI app + Socket.IO + APScheduler cron jobs
│       ├── core/                config, exceptions, logging
│       ├── routers/             search, tracks, stream, downloads, lyrics, playlists, settings
│       ├── schemas/             track, search, download, playlist, lyrics
│       ├── services/            search, ytmusic, spotify, download, stream, metadata, artwork, lyrics
│       └── websocket/           manager, events
│
└── web/
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── public/assets/           logo.png, favicon.ico, anim-logo.mp4, rhea.mp3
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── router.tsx
        ├── types/               track, player, download, playlist, search
        ├── store/               playerStore, queueStore, downloadStore, uiStore, themeStore
        ├── api/                 client, search, tracks, downloads, playlists, lyrics, library
        ├── hooks/               usePlayer, useQueue, useSearch, useDownloads, useLyrics,
        │                        useMediaSession, useKeyboardShortcuts, useAudioAnalyser
        ├── lib/                 utils, formatters, constants, websocket
        ├── pages/               home, search, library, liked, downloads, nowplaying,
        │                        playlist, album, artist, settings
        └── components/
            ├── ui/              Button, IconButton, Slider, Modal, Toast, Badge, Skeleton
            ├── layout/          RootLayout, Sidebar, BottomNav, TopBar
            ├── player/          PlayerBar, PlayerControls, ProgressBar, VolumeControl, QueuePanel
            ├── search/          SearchBar, SearchResults, CategoryGrid
            ├── library/         TrackRow, AlbumCard, ArtistCard, PlaylistCard
            ├── download/        DownloadButton, DownloadItem, DownloadModal
            ├── lyrics/          LyricsPanel, LyricsLine
            └── visualizer/      BarVisualizer, WaveVisualizer
```

---

## Roadmap

- [x] v1.3.0 — Single Howl instance, offline playback, like button end-to-end, stream cache fix, cron jobs
- [ ] v1.4.0 — Playlist CRUD in UI, album and artist pages with real data, dynamic artwork colours in Now Playing
- [ ] v1.5.0 — Equalizer UI, audio visualizer (bar + wave), multiple user profiles
- [ ] v1.6.0 — PWA (installable), background sync, Android APK via Capacitor
- [ ] v2.0.0 — Stable release, full test coverage, production-hardened

---

## Licence

MIT — see [LICENSE](LICENSE).

This licence covers the Shulker source code only. It does not grant rights to audio content downloaded through Shulker. You are responsible for complying with copyright law in your jurisdiction.

---

**Built by LethaboK** — [github.com/picklem0b](https://github.com/picklem0b)

> *Built in Termux on Android. Deployed on Render. Sounds like a proper server.*