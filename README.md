<div align="center">

<img src="web/public/assets/logo.png" width="96" height="96" style="border-radius:24px" alt="Shulker logo" />

# Shulker

**Music. Downloaded. Played.**

Self-hosted music streaming and download app — search, stream, and save songs with a Spotify-grade UI. No subscription. No ads. No data collection. Everything runs on your device.

[![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.103+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Live Demo](https://shulker.onrender.com) · [Report a Bug](https://github.com/lethabokhedama-png/shulker/issues) · [Request a Feature](https://github.com/lethabokhedama-png/shulker/issues)

</div>

---

## What is Shulker?

Shulker is a self-hosted, open-source music application built for people who want full control over their music. It looks and feels like Spotify Premium — same layout, smooth animations, iOS-quality UI — but everything runs on **your** device or **your** server.

The core idea: search any song, stream it instantly, download it in any format, save it to playlists, see synced lyrics — all from one app that you own.

Shulker is **not** a Spotify wrapper. It does not touch Spotify's audio. It uses YouTube Music as its audio source, and optionally uses Spotify's metadata API (free) only to read song information — titles, artwork, durations — when you paste a Spotify link.

---

## Screenshots

| Search | Now Playing | Downloads |
|--------|-------------|-----------|
| ![search](docs/screenshots/search.png) | ![now-playing](docs/screenshots/nowplaying.png) | ![downloads](docs/screenshots/downloads.png) |

---

## Quick Start

### Requirements

- Python 3.13+
- Node.js 18+
- ffmpeg — `pkg install ffmpeg` on Termux, `brew install ffmpeg` on Mac, `apt install ffmpeg` on Linux
- yt-dlp — installed automatically via pip

### 1. Clone

```bash
git clone https://github.com/lethabokhedama-png/shulker.git
cd shulker
```

### 2. Backend

```bash
cd api
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e .

cp .env.example .env
# Edit .env — set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET (optional but recommended)

uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload
```

API runs at `http://localhost:8000`. Swagger docs at `http://localhost:8000/api/docs`.

### 3. Frontend

```bash
cd web
npm install
npm run dev
```

App opens at `http://localhost:3000`. The Vite dev server proxies `/api` to `localhost:8000` automatically.

### 4. Spotify credentials (optional)

Spotify credentials unlock pasting Spotify links and give higher-quality artwork.

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create an app → copy Client ID and Client Secret
3. In Shulker: **Settings → Account** → paste both fields → Save

Without credentials everything else — search, stream, download, playlists, lyrics — works fully.

---

## CLI

After `pip install -e .`, the `shulker` command is available:

```bash
shulker                  # interactive REPL
shulker health           # check API status
shulker search "kendrick lamar"
shulker dl "not like us"
shulker dl "https://open.spotify.com/track/..."
shulker dl "https://youtu.be/abc123" --format=flac --quality=best
shulker dls              # list all download jobs
shulker status <id>      # check job status
shulker lyrics <id>      # fetch lyrics for a track
shulker lib              # browse local library
```

---

## How It Works

### Search

| Input | What happens |
|-------|-------------|
| Plain text | Calls ytmusicapi → returns tracks, albums, artists, playlists |
| Spotify track URL | Calls Spotify API for metadata → matches on YouTube Music → merges high-quality artwork with audio |
| Spotify album / playlist URL | Resolves every track concurrently → full collection ready to play or download |
| YouTube URL | Extracts video ID → fetches track info via ytmusicapi |
| SoundCloud, Bandcamp, etc. | Passes URL to yt-dlp info extractor directly |

Search runs at two levels simultaneously:
- **Suggestions** (80ms debounce) — autocomplete dropdown as you type
- **Full search** (200ms debounce) — all four categories in parallel via `asyncio.gather`

### Streaming

When you tap a track:

1. Frontend calls `/api/stream/{youtube_video_id}/audio`
2. Backend checks if the track is already downloaded locally
   - **Yes** → serves from disk with HTTP range support (instant)
   - **No** → pipes audio from yt-dlp stdout through the HTTP response in real time
3. First audio bytes arrive in ~2–3 seconds
4. Howler.js plays the stream with `html5: true` — no waiting for a full download

### Downloading

1. Frontend sends `trackId + format + quality` to `/api/downloads`
2. Backend queues the job and returns immediately — you see it in the Downloads tab
3. In the background:
   - yt-dlp downloads best available audio quality
   - ffmpeg converts to your chosen format (MP3 / FLAC / Opus / M4A / WAV)
   - mutagen writes ID3 tags (title, artist, album, artwork, lyrics)
   - File saved to `DOWNLOADS_DIR`
4. Real-time progress (0% → 100%) pushed via WebSocket
5. `rhea.mp3` plays as a completion notification

### Local Library

Shulker scans these directories on startup (configurable in Settings):

```
/data/data/com.termux/files/home/shulker/music   ← primary
/storage/emulated/0/Music                         ← Android music folder
/storage/emulated/0/Download
```

Every audio file is indexed by reading its ID3/vorbis tags. Local tracks appear in Library and play offline instantly.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (web/)                      │
│                                                         │
│  React 18 · TypeScript · Vite · Tailwind CSS           │
│  Zustand · TanStack Query · Howler.js · Framer Motion  │
│  Runs on port 3000                                     │
└─────────────────────────────────────────────────────────┘
                       │  HTTP + WebSocket
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    BACKEND (api/)                       │
│                                                         │
│  FastAPI · Python 3.13 · uvicorn · Socket.IO           │
│  yt-dlp · ffmpeg · ytmusicapi · mutagen · structlog    │
│  Runs on port 8000                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Features

**Player**
- Stream any song instantly — audio starts in ~2 seconds
- Full playback controls: play, pause, next, previous, shuffle, repeat (off / all / one)
- Seek slider with real-time timestamps
- Volume control with mute
- Like button synced to API
- Keyboard shortcuts (Space, arrows, N, P, R, S, Q, L, M, F)
- Lock screen / notification controls via Media Session API
- Single global Howl instance — no audio doubling or piling

**Now Playing**
- Fullscreen player with blurred artwork background
- Animated artwork that scales with playback state
- Synced lyrics (LRC) that scroll line-by-line in time with the song
- Queue panel (slide-in from bottom)
- Download current track from the player

**Library**
- Playlists, Albums, Artists tabs with grid / list toggle
- Liked Songs pinned at the top
- Create and manage playlists
- Import Spotify playlists by URL

**Downloads**
- Active, Queued, Saved, Errors tabs
- Live progress bar per job via WebSocket
- Format: MP3, FLAC, Opus, M4A, WAV
- Quality: 128 / 192 / 256 / 320 kbps / Best available
- Embed artwork and synced lyrics into downloaded files
- Retry failed jobs, cancel active jobs

**Search**
- Instant suggestions as you type
- Filter by: All / Tracks / Albums / Artists / Playlists
- Paste any Spotify, YouTube, SoundCloud, Bandcamp, or Deezer URL
- Prewarm: first 3 results are pre-resolved in the background so playback starts faster

**Settings**
- 7 accent colour themes with live preview
- Dark / light surface
- Spotify credentials (Client ID + Secret) with connection status
- Music directory management
- Crossfade, gapless playback, volume normalisation
- Configurable download format, quality, concurrent jobs

**UI**
- Spotify-inspired design system with CSS custom properties
- iOS-style spring animations (Framer Motion)
- Mobile-first: swipeable player shelf, bottom nav, safe area insets
- Desktop: persistent sidebar, full keyboard navigation
- Animated splash screen on first load

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `← →` | Seek ±10 seconds |
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
<summary>Show all endpoints</summary>

**Health**
```
GET  /api/health
```

**Search**
```
GET  /api/search?q=...&filter=...
GET  /api/search/suggest?q=...
POST /api/search/resolve          { url }
```

**Tracks**
```
GET  /api/tracks
GET  /api/tracks/liked
GET  /api/tracks/liked/count
GET  /api/tracks/recently-played
GET  /api/tracks/trending
GET  /api/tracks/{id}
POST /api/tracks/{id}/like
DEL  /api/tracks/{id}/like
POST /api/tracks/{id}/play
```

**Stream**
```
GET  /api/stream/{id}/audio
HEAD /api/stream/{id}/audio
GET  /api/stream/{id}/artwork
```

**Downloads**
```
POST /api/downloads
GET  /api/downloads
GET  /api/downloads/{id}
POST /api/downloads/{id}/cancel
POST /api/downloads/{id}/retry
DEL  /api/downloads/{id}
```

**Lyrics**
```
GET  /api/lyrics/{id}?title=&artist=
```

**Playlists**
```
GET   /api/playlists
POST  /api/playlists
GET   /api/playlists/{id}
PATCH /api/playlists/{id}
DEL   /api/playlists/{id}
POST  /api/playlists/{id}/tracks
DEL   /api/playlists/{id}/tracks/{tid}
PUT   /api/playlists/{id}/tracks/reorder
POST  /api/playlists/import
```

**Settings**
```
POST /api/settings/spotify
GET  /api/settings/spotify/status
```

</details>

---

## Deployment (Render)

Both services deploy via `render.yaml`:

**API** — Python web service
```
Build:  pip install -e .
Start:  uvicorn app.main:socket_app --host 0.0.0.0 --port $PORT
```

Set these in the Render dashboard:
```
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
MUSIC_DIR       = /tmp/shulker/music
DOWNLOADS_DIR   = /tmp/shulker/downloads
```

**Frontend** — Static site
```
Build:   npm install && npx vite build
Publish: dist/
```

> **Note:** Render's free tier sleeps after 15 minutes — the first request after sleep takes ~30 seconds. For permanent downloads without data loss, run the API locally on Termux and use Render only for the web UI.

---

## Themes

Shulker ships with 7 accent colour themes and dark / light surface:

| Theme | Colour |
|-------|--------|
| Crimson (default) | `#E5193A` |
| Rose | `#F43F5E` |
| Orange | `#F97316` |
| Violet | `#8B5CF6` |
| Cyan | `#06B6D4` |
| Green | `#22C55E` |
| Gold | `#EAB308` |

Theme is saved to `localStorage` and applied before first paint — no flash.

---

## Roadmap

- [ ] v1.3.0 — Onboarding modal, library and liked songs fully wired, like button end-to-end
- [ ] v1.4.0 — Playlist CRUD in UI, album and artist pages with real data, dynamic artwork colours in Now Playing
- [ ] v1.5.0 — Equalizer UI, audio visualizer (bar + wave), multiple user profiles
- [ ] v1.6.0 — PWA (installable), offline playback for downloaded tracks, background sync
- [ ] v2.0.0 — Stable release, full test coverage, production hardened

---

## File Structure

<details>
<summary>Show full structure</summary>

```
shulker/
├── README.md
├── CHANGELOG.md
├── render.yaml
├── .gitignore
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
│       ├── main.py
│       ├── core/           config, exceptions, logging
│       ├── routers/        search, tracks, stream, downloads, lyrics, playlists, settings
│       ├── schemas/        track, search, download, playlist, lyrics
│       ├── services/       search, ytmusic, spotify, download, stream, metadata, artwork, lyrics
│       └── websocket/      manager, events
│
└── web/
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── public/assets/      logo.png, favicon.ico, anim-logo.mp4, rhea.mp3
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── router.tsx
        ├── types/          track, player, download, playlist, search
        ├── store/          playerStore, queueStore, downloadStore, uiStore, themeStore
        ├── api/            client, search, tracks, downloads, playlists, lyrics, library
        ├── hooks/          usePlayer, useQueue, useSearch, useDownloads, useLyrics,
        │                   useMediaSession, useKeyboardShortcuts, useAudioAnalyser
        ├── lib/            utils, formatters, constants, websocket
        ├── pages/          home, search, library, liked, downloads, nowplaying,
        │                   playlist, album, artist, settings
        ├── components/
        │   ├── ui/         Button, IconButton, Slider, Modal, Toast, Badge, Skeleton, ScrollArea
        │   ├── layout/     RootLayout, Sidebar, BottomNav, TopBar
        │   ├── player/     PlayerBar, PlayerControls, ProgressBar, VolumeControl, QueuePanel
        │   ├── search/     SearchBar, SearchResults, CategoryGrid
        │   ├── library/    TrackRow, AlbumCard, ArtistCard, PlaylistCard
        │   ├── download/   DownloadButton, DownloadItem, DownloadModal
        │   ├── lyrics/     LyricsPanel, LyricsLine
        │   └── visualizer/ BarVisualizer, WaveVisualizer
        └── themes/         7 accent themes + dark/light surface
```

</details>

---

## Licence

MIT — see [LICENSE](LICENSE).

The MIT licence applies to the Shulker source code only. It does not grant rights to audio content downloaded using Shulker. You are responsible for complying with copyright law in your jurisdiction.

---

## Built by

**LethaboK** — [github.com/lethabokhedama-png](https://github.com/lethabokhedama-png)

Built on Termux (Android), deployed on Render. Developed with Claude (Anthropic) as a coding partner.

> *Built in the trenches. Runs on a phone. Sounds like a server room.*
