# Shulker

> Music. Downloaded. Played.

A self-hosted music streaming and download application. Search YouTube Music, paste Spotify/YouTube/SoundCloud links, stream instantly, download in any format — all from a premium iOS-style UI.

---

## Stack

| Layer     | Tech                                      |
|-----------|-------------------------------------------|
| Frontend  | React 18, Vite, TypeScript, Framer Motion |
| Backend   | FastAPI, Python 3.13, asyncio             |
| Audio     | yt-dlp, Howler.js                         |
| Search    | ytmusicapi, Spotify Web API               |
| Realtime  | Socket.IO                                 |
| Styling   | Tailwind CSS v3                           |
| State     | Zustand, TanStack Query                   |

---

## Features

- 🔍 Search YouTube Music
- 🔗 Paste any link — Spotify, YouTube, SoundCloud, Bandcamp, Deezer...
- ▶ Stream instantly via yt-dlp pipe
- ⬇ Download in MP3, FLAC, OPUS, M4A, WAV
- 🎵 Synced lyrics
- 📚 Local library scanner
- 🎨 7 accent themes + dark/light surface
- ⌨ Full keyboard shortcuts
- 📱 iOS-style UI, works on mobile
- 🖥 CLI — `shulker search`, `shulker dl`, `shulker health`

---

## Getting started

### Requirements

- Python 3.13+
- Node.js 18+
- ffmpeg
- yt-dlp

### Backend

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -e . --break-system-packages

# Copy and edit env
cp .env.example .env

uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd web
npm install
npm run dev
```

### CLI

```bash
# After pip install -e .
shulker                        # interactive REPL
shulker health                 # check API
shulker search "kendrick lamar"
shulker dl "not like us"
shulker dl "https://open.spotify.com/track/..."
shulker resolve "https://soundcloud.com/..."
```

---

## Environment

```env
ENV=development
API_HOST=0.0.0.0
API_PORT=8000
MUSIC_DIR=/path/to/music
DOWNLOADS_DIR=/path/to/downloads
SPOTIFY_CLIENT_ID=your_id
SPOTIFY_CLIENT_SECRET=your_secret
```

---

## Roadmap

See [CHANGELOG.md](./CHANGELOG.md) for version history.

- `v0.2.0-beta` — first full working search → download → play flow
- `v0.3.0-beta` — Spotify playlist import
- `v1.0.0` — stable, production ready

---

## Built by

**LethaboK** — [@lethabokhedama-png](https://github.com/lethabokhedama-png)

