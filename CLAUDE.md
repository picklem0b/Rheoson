# CLAUDE.md — Rheoson Codebase Context

> Single source of truth for any AI working on Rheoson. Read this before touching any file.
> Version: 2.11.0 · Updated: 2026-08-30

---

## Project Overview

Rheoson is a self-hosted music streaming and download app. No subscription, no ads. Users stream from YouTube Music, download tracks locally, manage playlists, and play back offline. Primary deployment target is a personal Termux environment on Android — the backend runs on-device at `127.0.0.1:8000`, the frontend is loaded in a Capacitor WebView as a native APK. A secondary cloud deployment exists on Render (free tier, ephemeral disk).

**Version:** `2.11.0` in `api/pyproject.toml`, `web/package.json`, `web/src/lib/constants.ts`, and `api/app/main.py`. Keep these in sync.  
**App ID (Android):** `com.lethabo.Rheoson`  
**Versioning convention:** General Projects (`v(major).(minor).(patch)`), annotated tags, `--follow-tags` always.

---

## Repo Structure

```
Rheoson/
├── api/                      # FastAPI + Socket.IO backend (Python 3.13)
│   ├── app/
│   │   ├── main.py           # Entry point, mounts Socket.IO, registers routers, cron jobs
│   │   ├── core/
│   │   │   ├── config.py     # Settings via pydantic-settings (.env)
│   │   │   ├── exceptions.py # RheosonException hierarchy + handlers
│   │   │   └── logging.py    # structlog configuration
│   │   ├── routers/          # Route handlers (thin — delegate to services)
│   │   │   ├── search.py
│   │   │   ├── tracks.py     # Track index, liked, history, trending
│   │   │   ├── stream.py     # Audio streaming (local file + yt-dlp pipe)
│   │   │   ├── downloads.py  # Job CRUD (delegates to download_service)
│   │   │   ├── lyrics.py
│   │   │   ├── playlists.py  # JSON-file backed playlist CRUD
│   │   │   └── settings.py   # Spotify credential management
│   │   ├── services/
│   │   │   ├── download_service.py   # Core download orchestration
│   │   │   ├── ytmusic_service.py    # YTMusic API wrapper (singleton)
│   │   │   ├── spotify_service.py    # Spotify API (token cache, resolve)
│   │   │   ├── search_service.py     # Search fanout + URL resolution
│   │   │   ├── metadata_service.py   # mutagen tag read/write, file ID
│   │   │   ├── artwork_service.py    # Extract/fetch album art
│   │   │   ├── lyrics_service.py     # syncedlyrics → LRC parser
│   │   │   └── stream_service.py     # (empty placeholder)
│   │   ├── schemas/                  # Pydantic models (response shapes)
│   │   │   ├── track.py
│   │   │   ├── download.py
│   │   │   ├── playlist.py
│   │   │   ├── search.py
│   │   │   └── lyrics.py
│   │   └── websocket/
│   │       ├── manager.py    # ConnectionManager singleton (wraps sio)
│   │       └── events.py     # connect/disconnect/ping handlers
│   ├── pyproject.toml        # Python deps, entry point: `Rheoson` CLI
│   └── requirements.txt      # Thin — pyproject.toml is the source
│
├── web/                      # React 18 + Vite frontend (TypeScript)
│   ├── src/
│   │   ├── App.tsx           # QueryClient, RouterProvider, SplashScreen
│   │   ├── router.tsx        # react-router-dom v6 route tree
│   │   ├── main.tsx          # ReactDOM.render entry
│   │   ├── sw.ts             # Workbox service worker (PWA)
│   │   ├── api/              # Typed fetch wrappers
│   │   │   ├── client.ts     # Core fetch, makeAbortable, ApiError
│   │   │   ├── tracks.ts
│   │   │   ├── search.ts
│   │   │   ├── downloads.ts
│   │   │   ├── library.ts    # albums, artists, featured
│   │   │   ├── playlists.ts
│   │   │   └── lyrics.ts
│   │   ├── store/            # Zustand stores (all named `use*Store`)
│   │   │   ├── playerStore.ts    # currentTrack, volume, repeatMode, savedProgress
│   │   │   ├── queueStore.ts     # queue, history, originalQueue
│   │   │   ├── downloadStore.ts  # DownloadJob list (persisted: done/error only)
│   │   │   ├── uiStore.ts        # Panel visibility, downloadModalTrackId
│   │   │   └── themeStore.ts     # Active theme name
│   │   ├── hooks/
│   │   │   ├── usePlayer.ts          # Howler singleton, loadAndPlay, play/pause/seek
│   │   │   ├── useQueue.ts           # Thin wrapper around queueStore
│   │   │   ├── useDownloads.ts       # WebSocket-driven download state sync
│   │   │   ├── useSearch.ts          # Debounced search with TanStack Query
│   │   │   ├── useLyrics.ts          # Lyrics fetch + active line tracking
│   │   │   ├── useMediaSession.ts    # Media Session API (lock screen controls)
│   │   │   ├── useKeyboardShortcuts.ts
│   │   │   ├── useAudioAnalyser.ts   # Web Audio API analyser (visualizer)
│   │   │   ├── usePersisted.ts       # localStorage helper
│   │   │   └── useSpotifyCredentials.ts
│   │   ├── pages/            # Route-level components
│   │   │   ├── home/Home.tsx                    # Sections: featured, trending, recent
│   │   │   ├── search/Search.tsx                # Full-featured search page
│   │   │   ├── library/Library.tsx              # Tabs: Liked, Playlists, Albums, Artists
│   │   │   ├── nowplaying/NowPlaying.tsx        # Fullscreen player sheet
│   │   │   ├── downloads/Downloads.tsx          # Local/Downloaded/Activity tabs
│   │   │   ├── settings/Settings.tsx            # Sectioned settings shell
│   │   │   ├── playlist/Playlist.tsx
│   │   │   ├── album/Album.tsx
│   │   │   └── artist/Artist.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── RootLayout.tsx    # Shell: sidebar + player bar + bottom nav
│   │   │   │   ├── BottomNav.tsx     # Mobile-only bottom navigation
│   │   │   │   ├── Sidebar.tsx       # Desktop-only left nav
│   │   │   │   └── TopBar.tsx        # Page header (back, title, actions)
│   │   │   ├── player/
│   │   │   │   ├── PlayerBar.tsx     # Persistent mini player (bottom of layout)
│   │   │   │   ├── PlayerControls.tsx
│   │   │   │   ├── ProgressBar.tsx
│   │   │   │   ├── QueuePanel.tsx
│   │   │   │   ├── QueueItem.tsx
│   │   │   │   └── VolumeControl.tsx
│   │   │   └── ui/               # Primitives: Button, Badge, Modal, Slider, etc.
│   │   ├── lib/
│   │   │   ├── constants.ts      # API_BASE, WS_URL, ENDPOINTS, STORAGE_KEYS
│   │   │   ├── formatters.ts     # formatDuration, formatDate
│   │   │   ├── utils.ts          # cn(), shuffle(), isSpotifyUrl()
│   │   │   └── websocket.ts      # Socket.IO singleton + useWebSocket hook
│   │   ├── types/
│   │   │   ├── track.ts          # Track, Artist, Album
│   │   │   ├── download.ts       # DownloadJob, DownloadStatus, AudioFormat
│   │   │   ├── player.ts         # RepeatMode
│   │   │   ├── playlist.ts
│   │   │   └── search.ts
│   │   └── themes/index.ts       # Theme definitions (CSS variable maps)
│   ├── capacitor.config.ts       # Capacitor: appId, Android settings
│   ├── vite.config.ts            # Vite: proxy, PWA, chunk splitting
│   ├── tailwind.config.ts
│   └── package.json
│
├── docker-compose.yml            # Dev: api + web + nginx
├── docker-compose.prod.yml       # Prod: no HMR, pre-built static
├── render.yaml                   # Render.com deployment config
├── nginx/nginx.conf              # Reverse proxy config
└── .github/workflows/build-apk.yml  # CI: debug APK on push to main
```

---

## System Architecture

```
Android APK (Capacitor WebView)
        │
        ├── loads bundled dist/ in prod
        └── points at RHEOSON_DEV_URL in dev
                        │
              React SPA (Vite)
                        │
          ┌─────────────┼─────────────┐
          │             │             │
       REST API      Socket.IO    Service Worker
    /api/* over     /socket.io     (Workbox PWA)
      HTTP(S)       websocket       offline cache
          │
    FastAPI (uvicorn)
    socket_app = socketio.ASGIApp(sio, app)
          │
    ┌─────┴──────────────────┐
    │                        │
  Routers               Services
    │                        │
    ├── search        ├── ytmusic_service (YTMusic singleton)
    ├── tracks        ├── spotify_service (token cache)
    ├── stream        ├── search_service (fanout + URL resolve)
    ├── downloads     ├── download_service (asyncio + yt-dlp)
    ├── lyrics        ├── metadata_service (mutagen)
    ├── playlists     ├── lyrics_service (syncedlyrics)
    └── settings      └── artwork_service
          │
    File System (MUSIC_DIR)
    /data/data/com.termux/files/home/Rheoson/music  (Termux default)
    /tmp/Rheoson/music                               (Render)
```

**Critical:** `uvicorn` always targets `socket_app`, not `app`. Using `app` bypasses the Socket.IO ASGI wrapper — download progress events stop working.

---

## Backend Architecture

### Entry Point — `api/app/main.py`

- Creates `FastAPI` app, adds CORS, exception handlers
- Creates `socketio.AsyncServer`, wraps into `socketio.ASGIApp` as `socket_app`
- Mounts all routers under `/api/*`
- Registers three APScheduler cron jobs:
    - **library_scan** every 30 min — invalidates `_track_index` and `_local_cache`
    - **ytdlp_update** daily at 03:00 UTC — runs `yt-dlp -U` in executor
    - **job_cleanup** every 6 hours — trims `_jobs` dict to last 100, prunes stale done-jobs
- `_ALLOWED_ORIGINS` parsed from `CORS_ORIGINS` env var (can be list or comma string)

### Configuration — `api/app/core/config.py`

All config via `pydantic-settings`. Reads `.env` at startup.

| Setting                    | Default                       | Notes                                    |
| -------------------------- | ----------------------------- | ---------------------------------------- |
| `MUSIC_DIR`                | Termux path                   | Where downloads land, library scans      |
| `DOWNLOADS_DIR`            | Termux path                   | Legacy — nothing reads from here now     |
| `EXTRA_MUSIC_DIRS`         | Android Music/Download/sdcard | Scanned alongside MUSIC_DIR              |
| `SPOTIFY_CLIENT_ID/SECRET` | `""`                          | Optional; enables Spotify URL resolution |
| `CORS_ORIGINS`             | `["*"]`                       | Set in Render dashboard for prod         |
| `MAX_CONCURRENT_DOWNLOADS` | `4`                           | Semaphore limit in download_service      |
| `AUDIO_FORMAT`             | `mp3`                         | Default download format                  |
| `AUDIO_QUALITY`            | `0`                           | yt-dlp quality string                    |

`settings.all_music_dirs` — property, returns only dirs that actually exist on disk.  
`settings.has_spotify` — property, True when both client ID and secret are set.

### Stream Router — `api/app/routers/stream.py`

Two-tier audio serving:

**Tier 1 — local file cache**

- `_local_cache: dict[str, Path]` built lazily on first request
- `_file_id(path)` → MD5 of the absolute path string, first 16 chars (from `metadata_service`)
- Lock (`_cache_lock`) prevents concurrent rebuilds
- Cache invalidated by `invalidate_stream_cache()` — called after download completes and by cron
- Supports HTTP range requests (206 Partial Content) for seekable playback

**Tier 2 — yt-dlp pipe**

- Called only when track is not in local cache
- Spawns `yt-dlp -x --audio-format mp3` with stdout piped to `StreamingResponse`
- Retries up to 3 times with different `--extractor-args` variants (mweb → web → android)
- Returns 502 after all attempts fail

`GET /{track_id}/audio` — HEAD allowed, returns optimistic headers for non-local tracks  
`GET /{track_id}/artwork` — extracts embedded artwork from local files only (204 if not local)

### Download Service — `api/app/services/download_service.py`

**State:**

- `_jobs: dict[str, dict]` — in-memory only, lost on restart
- `_tasks: dict[str, asyncio.Task]` — running asyncio tasks
- `_sem: asyncio.Semaphore` — `MAX_CONCURRENT_DOWNLOADS` concurrent yt-dlp processes

**Download pipeline:**

1. `enqueue_download()` — resolves URL (YouTube ID → yt URL, Spotify → search → yt URL), creates job dict, spawns asyncio task
2. `_run_download()` — calls yt-dlp via `YoutubeDL` in executor under semaphore; outputs to `MUSIC_DIR/<Artist>/<Title>.<ext>` (not DOWNLOADS_DIR — this was a bug that was fixed)
3. `_tag_and_finish()` — writes ID3/vorbis tags via `metadata_service.write_tags()`, optionally embeds lyrics
4. On completion: invalidates both `_local_cache` (stream) and `_track_index` (tracks)
5. WebSocket events emitted at each stage: `download:progress`, `download:done`, `download:error`

**Progress reporting:**

- yt-dlp progress hook runs in thread → `asyncio.run_coroutine_threadsafe` to emit WS events
- Progress: 0–80% during download, 82% converting, 90% tagging, 100% done

### Track Index — `api/app/routers/tracks.py`

- `_track_index: dict[str, dict] | None` — lazy cache, None means stale
- `invalidate_track_index()` — sets to None; called after download completes and by cron
- `_build_index()` — scans `MUSIC_DIR` recursively, reads metadata for every audio file
- Liked tracks: stored in `MUSIC_DIR/.liked.json` (list of track IDs)
- Play history: stored in `MUSIC_DIR/.history.json` (list of `{id, playedAt}`, max 200)
- **Route ordering matters:** static routes (`/liked`, `/liked/count`, `/recently-played`, `/trending`) registered before `/{track_id}` — otherwise FastAPI matches "liked" as a track ID

### Playlists — `api/app/routers/playlists.py`

- Stored as `MUSIC_DIR/.playlists.json` (dict keyed by playlist ID)
- Tracks stored as list of track IDs (strings), not embedded track objects
- `POST /{id}/import` — resolves a Spotify URL via `search_service.resolve_url()` and appends matched YouTube IDs

### Search Service — `api/app/services/search_service.py`

- Detects query type: plain text → YTMusic search; URL → dispatch by type
- URL types: `youtube`, `spotify`, `ytdlp` (SoundCloud, Bandcamp, etc.)
- Spotify requires `settings.has_spotify` — raises `SearchError` with instructions if missing
- Spotify → YTMusic matching: concurrent with `asyncio.Semaphore(5)` for album/playlist imports
- Local library search: `_search_local()` — scans MUSIC_DIR, reads metadata, fuzzy title/artist/album match
- Prewarm: after search, fires HEAD requests to `/api/stream/{id}/audio` for first 3 non-downloaded results to warm the stream cache

### YTMusic Service — `api/app/services/ytmusic_service.py`

- `YTMusic()` singleton, guarded by `_ytm_lock` and double-checked locking
- Once failed, `_ytm_error` is set and all calls raise `SearchError` immediately (no retry storm)
- All YTMusic calls run in `run_in_executor` — the library is synchronous
- Concurrent search: `asyncio.gather` across songs/albums/artists/playlists
- Track ID = `videoId` (YouTube 11-char ID)

### WebSocket — `api/app/websocket/`

- `ConnectionManager` is a thin singleton wrapper: `ws_manager.init(sio)` called at startup
- Pending event queue: events emitted before `init()` are queued and flushed on startup
- Server-side heartbeat: periodic `server:ping` events with configurable interval/timeout
- Emit methods: `emit_download_progress`, `emit_download_done`, `emit_download_error`
- All emits are broadcast (no room targeting) — single-user app
- CORS: socket CORS uses the same `_ALLOWED_ORIGINS` list as the FastAPI app

### WebSocket Client — `web/src/lib/websocket.lib.ts`

- `_socket: Socket | null` — module-level singleton, one connection for the whole app
- Lazy connection: socket only connects when the first component mounts and uses it
- `_refCount` — reference counting; socket disconnected when count hits 0
- `_registry: Map<event, Set<Handler>>` — deduplication layer preventing double-registration on re-renders
- `ws` — imperative API for non-hook usage
- `useWebSocket(options)` — React hook, increments refCount on mount, decrements on unmount
- `useDownloadSocket(handlers)` — convenience hook wiring `download:progress/done/error`

### Metadata — `api/app/services/metadata_service.py`

- `_file_id(path)` — `MD5(str(path))[:16]` — this IS the track ID for local files
- `read_track_metadata(path)` → TrackSchema-compatible dict; uses mutagen easy tags
- `write_tags(path, ...)` — dispatches to `_write_mp3`, `_write_flac`, `_write_m4a`, `_write_ogg`
- Local tracks always have `isDownloaded: True`, `streamUrl: /api/stream/{file_id}/audio`

---

## Frontend Architecture

### State Management

Five Zustand stores:

**`playerStore`** (persisted)

- Persisted fields: `currentTrack`, `savedProgress`, `volume`, `isMuted`, `repeatMode`, `isShuffled`
- NOT persisted: `isPlaying`, `isLoading`, `progress`, `duration`
- `saveProgress(s)` — written every ~5s during playback and on pause/stop; used to resume after reload/crash
- `setTrack(track)` — resets `savedProgress` to 0 (intentional: fresh track starts from 0)

**`queueStore`** (not persisted)

- Three lists: `queue` (upcoming), `history` (played, current track is last item), `originalQueue`
- `setQueue(tracks, startIndex)` — slices at startIndex; before → history, after → queue
- `next(isShuffled)` — random index when shuffled, always index 0 when sequential
- `prev()` — pops from history, pushes current back to front of queue
- Repeat-all: handled in `usePlayer.ts` — when queue exhausts and `repeatMode === 'all'`, resets from `originalQueue`

**`downloadStore`** (persisted: done/error only)

- In-flight jobs not persisted — they can't resume after page reload
- `selectActiveJobs`, `selectCompletedJobs`, `selectErrorJobs` — external selectors (no closure risk)

**`uiStore`** (persisted: only `sidebarCollapsed`)

- Queue and lyrics panels are mutually exclusive: opening one closes the other

**`themeStore`** (persisted)

- Theme name → CSS variable swaps via `themes/index.ts`

### Audio Engine — `web/src/hooks/usePlayer.ts`

Module-level singletons (not React state — survive re-renders):

- `_howl: Howl | null` — single Howler instance
- `_loadedId: string | null` — currently loaded track ID
- `_timer: number | null` — 250ms interval driving progress bar
- `_playedThisSession: Set<string>` — prevents duplicate `recordPlay` calls

**`loadAndPlay(trackId, forceRestart, autoplay, seekTo)`**

- If `_loadedId === trackId` and not forceRestart → reuse existing Howl, just seek
- Otherwise: `_destroy()` previous Howl, create new one with `html5: true`
- Stream URL always goes through `tracksApi.getStreamUrl(id)` → `/api/stream/{id}/audio`
- `onplay`: starts 250ms timer, calls `tracksApi.recordPlay()` (once per session)
- `onpause`: stops timer, saves current position via `saveProgress()`
- `onend`: calls `onEndRef.current()` → handles repeat-one, repeat-all, skip-next
- `onplayerror`: attempts `Howler.ctx.resume()` for suspended AudioContext (Android gesture lock)

**Resume after reload:**

- `useEffect` on `currentTrack?.id` — if track is rehydrated but no Howl exists, calls `loadAndPlay(id, false, false, savedProgress)` — loads silently at saved position, user taps play to start

**Volume sync:** `useEffect` on `volume/isMuted` → `_howl?.volume(isMuted ? 0 : vol)`

### WebSocket Client — `web/src/lib/websocket.ts`

- `_socket: Socket | null` — module-level singleton, one connection for the whole app
- `_refCount` — reference counting; socket disconnected when count hits 0
- `_registry: Map<event, Set<Handler>>` — deduplication layer preventing double-registration on re-renders (was a bug before this fix)
- `ws` — imperative API for non-hook usage
- `useWebSocket(options)` — React hook, increments refCount on mount, decrements on unmount
- `useDownloadSocket(handlers)` — convenience hook wiring `download:progress/done/error`

### API Client — `web/src/api/client.ts`

- `API_BASE` from `lib/constants.ts`:
    - Dev: `/api` (proxied by Vite to `http://127.0.0.1:8000`)
    - Prod: `${VITE_API_URL}/api` (e.g. `https://Rheoson-api-vnny.onrender.com/api`)
- All domain-specific modules (`tracks.ts`, `search.ts`, etc.) import `api` from here
- `makeAbortable()` → `{signal, abort}` for cancellable requests

### Router — `web/src/router.tsx`

All pages nested under `RootLayout` (shell with sidebar + PlayerBar) **except** `/now-playing` which renders `NowPlaying` fullscreen without the shell.

Routes:

- `/` → Home
- `/search` → Search
- `/library` → Library (tabs: Liked, Playlists, Albums, Artists)
- `/downloads` → Downloads (tabs: Local, Downloaded, Activity)
- `/settings` → Settings (sectioned: Appearance, Layout, Audio, Downloads, etc.)
- `/playlist/:id` → Playlist
- `/album/:id` → Album
- `/artist/:id` → Artist
- `/liked` → Redirects to `/library`
- `/playlists` → Redirects to `/library`
- `/recently-played`, `/trending`, `/featured` → Home section drill-downs
- `/now-playing` → NowPlaying (outside RootLayout)

### Service Worker — `web/src/sw.ts`

Workbox-based, `injectManifest` strategy (we own the SW, Workbox injects `__WB_MANIFEST`):

| Route                              | Strategy                         | Notes                                   |
| ---------------------------------- | -------------------------------- | --------------------------------------- |
| Google Fonts                       | CacheFirst 1yr                   | Plus Jakarta Sans, DM Sans              |
| `/api/stream/*/artwork`, ytimg.com | CacheFirst 30d, max 500          | Album art offline                       |
| `/api/stream/*/audio`              | CacheFirst + RangeRequestsPlugin | Audio offline; range support for Howler |
| `/api/*` (non-stream)              | NetworkFirst                     | API responses with offline fallback     |
| Everything else                    | StaleWhileRevalidate             | App shell                               |

SW disabled in dev (`devOptions.enabled: false`) — incompatible with HMR.

### PWA / Capacitor

- `vite-plugin-pwa` with `registerType: 'autoUpdate'`
- Capacitor appId: `com.lethabo.Rheoson`
- `allowMixedContent: true` — Termux runs HTTP; APK talks to both local HTTP and Render HTTPS
- Splash screen dismissed manually from `SplashScreen.tsx`
- APK built by GitHub Actions on push to `main` (`build-apk.yml`)
- Dev workflow: `RHEOSON_DEV_URL=http://<LAN-IP>:3000 npx cap run android`

---

## Streaming Pipeline

```
Frontend                          Backend
  │                                 │
  │  new Howl({ src: [streamUrl] }) │
  │  streamUrl = /api/stream/{id}/audio
  │──────────────────────────────►  │
  │  (HEAD or GET with Range)        │
  │                                 ├── _ensure_cache()
  │                                 ├── _find_local(id)
  │                                 │
  │                         found? ─┤
  │                                 ├── YES: _serve_local()
  │  ◄── 206 Partial Content ──────  │   Range support, 64KB chunks
  │                                 │
  │                         not found?
  │                                 ├── NO: _serve_ytdlp()
  │                                 │   yt-dlp spawned, stdout piped
  │  ◄── 200 StreamingResponse ───  │   retry x3 with variant args
  │                                 │
  │  Howler buffers + plays          │
```

**Track ID semantics:**

- YouTube tracks: 11-char `videoId` (e.g. `dQw4w9WgXcQ`)
- Local files: `MD5(str(path))[:16]` hex string

These are different namespaces. The stream router handles both: YouTube IDs go to yt-dlp, local IDs hit the cache.

---

## Data Model

No database. All persistence is file-system based:

| Data          | Location                           | Format                                     |
| ------------- | ---------------------------------- | ------------------------------------------ |
| Music files   | `MUSIC_DIR/<Artist>/<Title>.<ext>` | MP3/FLAC/M4A/OGG/OPUS/WAV                  |
| Liked tracks  | `MUSIC_DIR/.liked.json`            | `string[]` (track IDs)                     |
| Play history  | `MUSIC_DIR/.history.json`          | `{id: string, playedAt: string}[]` max 200 |
| Playlists     | `MUSIC_DIR/.playlists.json`        | `{[id]: PlaylistObject}`                   |
| Spotify creds | `api/.env`                         | Written by `settings.py` router at runtime |
| Download jobs | In-memory `_jobs` dict             | Lost on restart                            |

**Track shape (shared frontend/backend contract):**

```typescript
interface Track {
	id: string; // YouTube videoId OR MD5 file ID
	title: string;
	artist: Artist; // { id, name, imageUrl?, genres? }
	album: Album; // { id, title, artist, artworkUrl, releaseYear, trackCount }
	artworkUrl: string; // /api/stream/{id}/artwork OR YouTube thumbnail URL
	duration: number; // seconds
	streamUrl?: string; // /api/stream/{id}/audio
	filePath?: string; // absolute path if local
	isDownloaded: boolean;
	isLiked: boolean;
	youtubeId?: string;
	spotifyId?: string;
}
```

---

## Mobile Architecture

The APK is a Capacitor WebView shell:

```
web/android/
├── app/
│   ├── build.gradle          # compileSdk 35, targetSdk 35
│   ├── src/main/
│   │   ├── AndroidManifest.xml  # INTERNET, WRITE_EXTERNAL_STORAGE, etc.
│   │   └── java/com/lethabo/Rheoson/MainActivity.java
│   └── Rheoson-release.keystore  # Release signing key
└── variables.gradle          # Capacitor SDK versions
```

**Key Capacitor config (`capacitor.config.ts`):**

- `allowMixedContent: true` — required for Termux HTTP backend
- `captureInput: true` — correct keyboard handling for search/settings inputs
- `webContentsDebuggingEnabled: !isProd` — Chrome DevTools remote debugging in dev
- `SplashScreen.launchAutoHide: false` — dismissed manually via `SplashScreen.tsx`
- `CapacitorHttp.enabled: true` — native HTTP client, avoids CORS on 127.0.0.1

---

## Authentication

There is none. Rheoson is single-user, self-hosted. No login, no sessions, no JWT.

Spotify credentials are stored in `.env` and hot-reloaded into `settings` at runtime via `POST /api/settings/spotify`. The `spotify_status` endpoint returns `connected: bool` and a truncated client ID.

---

## API Structure

Base: `/api`

| Method   | Path                           | Handler            | Notes                                          |
| -------- | ------------------------------ | ------------------ | ---------------------------------------------- |
| GET      | `/health`                      | `main.py`          | Returns version, dirs, cron job state          |
| GET      | `/library/featured`            | `main.py`          | First N playlists as hero cards                |
| GET      | `/library/albums`              | `main.py`          | Albums derived from track index                |
| GET      | `/library/artists`             | `main.py`          | Artists derived from track index               |
| GET      | `/search`                      | `search.router`    | `?q=&filter=` — songs/albums/artists/playlists |
| GET      | `/search/suggest`              | `search.router`    | Autocomplete suggestions                       |
| POST     | `/search/resolve`              | `search.router`    | URL resolution (YouTube, Spotify, etc.)        |
| GET      | `/tracks`                      | `tracks.router`    | All local tracks                               |
| GET      | `/tracks/liked`                | `tracks.router`    | Liked track IDs hydrated                       |
| GET      | `/tracks/liked/count`          | `tracks.router`    | Count only                                     |
| GET      | `/tracks/recently-played`      | `tracks.router`    | History hydrated                               |
| GET      | `/tracks/trending`             | `tracks.router`    | YTMusic charts                                 |
| GET      | `/tracks/{id}`                 | `tracks.router`    | Single track (local first, YT fallback)        |
| POST     | `/tracks/{id}/like`            | `tracks.router`    | Add to liked                                   |
| DELETE   | `/tracks/{id}/like`            | `tracks.router`    | Remove from liked                              |
| POST     | `/tracks/{id}/play`            | `tracks.router`    | Record in history                              |
| GET/HEAD | `/stream/{id}/audio`           | `stream.router`    | Audio bytes (range supported)                  |
| GET      | `/stream/{id}/artwork`         | `stream.router`    | Embedded artwork bytes                         |
| GET      | `/lyrics/{id}`                 | `lyrics.router`    | `?title=&artist=`                              |
| POST     | `/downloads`                   | `downloads.router` | Start download job                             |
| GET      | `/downloads`                   | `downloads.router` | List all jobs                                  |
| GET      | `/downloads/{id}`              | `downloads.router` | Single job                                     |
| POST     | `/downloads/{id}/cancel`       | `downloads.router` | Cancel running job                             |
| POST     | `/downloads/{id}/retry`        | `downloads.router` | Re-enqueue failed job                          |
| DELETE   | `/downloads/{id}`              | `downloads.router` | Remove from job store                          |
| GET      | `/playlists`                   | `playlists.router` | List all                                       |
| POST     | `/playlists`                   | `playlists.router` | Create                                         |
| GET      | `/playlists/{id}`              | `playlists.router` | Single                                         |
| PATCH    | `/playlists/{id}`              | `playlists.router` | Update title/description                       |
| DELETE   | `/playlists/{id}`              | `playlists.router` | Delete                                         |
| POST     | `/playlists/{id}/tracks`       | `playlists.router` | Add track                                      |
| DELETE   | `/playlists/{id}/tracks/{tid}` | `playlists.router` | Remove track                                   |
| POST     | `/playlists/{id}/import`       | `playlists.router` | Import Spotify playlist                        |
| POST     | `/settings/spotify`            | `settings.router`  | Save Spotify credentials                       |
| GET      | `/settings/spotify/status`     | `settings.router`  | Credential status                              |

**Socket.IO events (server → client):**

- `download:progress` — `{id, progress, status, title?}`
- `download:done` — `{id, status: "done", progress: 100, filePath}`
- `download:error` — `{id, status: "error", error}`

**Socket.IO events (client → server):**

- `ping` → `pong {sid}`

---

## Important Modules

### `cn()` — `web/src/lib/utils.ts`

Utility combining `clsx` + `tailwind-merge`. Used in 100+ components. Most-connected node in the graph. Signature: `cn(...inputs: ClassValue[]) => string`.

### `formatDuration()` — `web/src/lib/formatters.ts`

Second most referenced utility after `cn`. Converts seconds → `m:ss` or `h:mm:ss`. Used in every track list row and player bar.

### `_file_id()` — `api/app/services/metadata_service.py`

`hashlib.md5(str(path).encode()).hexdigest()[:16]` — this function is the identity contract for local files. If it changes, every cached URL breaks. Do not change without migrating all stored track IDs.

### `usePlayerStore` — `web/src/store/playerStore.ts`

38 edges in the graph — most connected frontend node. Anything that reads or writes playback state goes through here. Never bypass it with local component state for track/volume/repeat concerns.

---

## Dependency Relationships

### Cache Invalidation Chain

```
download completes
        │
        ├── invalidate_stream_cache()   ← stream.py: _cache_built = False
        └── invalidate_track_index()    ← tracks.py: _track_index = None
                │
                └── cron (30 min): invalidates both
```

If either invalidation is skipped, the download appears to succeed but the track doesn't appear in the library or stream from disk until a server restart.

### Download → WebSocket → Frontend

```
download_service._download_task()
        │
        ├── ws_manager.emit_download_progress(job_id, pct, status)
        ├── ws_manager.emit_download_done(job_id, filePath)
        └── ws_manager.emit_download_error(job_id, error)
                │
        websocket/manager.py (singleton ws_manager)
                │
        sio.emit() → Socket.IO
                │
        client: websocket.ts (_socket.on())
                │
        useDownloadSocket → useDownloads.ts → downloadStore.updateJob()
```

### Settings → Spotify → Search

```
POST /api/settings/spotify
        │
        ├── writes api/.env
        ├── hot-reloads settings.SPOTIFY_CLIENT_ID/SECRET
        └── clears spotify_service._token_cache

GET /api/search?q=spotify:...
        │
        └── search_service.resolve_url()
                │
                └── requires settings.has_spotify (both creds non-empty)
```

### Frontend Track ID Flow

```
YTMusic result → id = videoId (11 chars)
        │
        ├── streamUrl = /api/stream/{videoId}/audio
        │       └── backend: cache miss → yt-dlp pipe
        │
        └── download → file saved to disk
                └── track_index built → id = MD5(path)[:16]
                        └── streamUrl = /api/stream/{md5id}/audio
                                └── backend: cache hit → local file serve
```

This means a track changes its `id` after being downloaded. The frontend's `isDownloaded` flag on search results is set by the backend — but because the track is re-identified after download, the library shows a different entry. This is a known V2 issue.

---

## Critical Files

Files where a change has wide blast radius — always check these when modifying:

| File                                   | Why critical                                                 |
| -------------------------------------- | ------------------------------------------------------------ |
| `api/app/main.py`                      | Mounts everything; `socket_app` must be the uvicorn target   |
| `api/app/core/config.py`               | All settings; change here affects all services               |
| `api/app/services/metadata_service.py` | `_file_id()` is the identity contract for local tracks       |
| `api/app/services/download_service.py` | Cache invalidation, WebSocket emit, job lifecycle            |
| `api/app/routers/stream.py`            | Audio serving; range support must not break                  |
| `api/app/routers/tracks.py`            | Route ORDER matters — static routes before `/{track_id}`     |
| `web/src/hooks/usePlayer.ts`           | Module-level Howl singleton; double-play bug lives here      |
| `web/src/lib/websocket.ts`             | Socket singleton; registry prevents duplicate event handlers |
| `web/src/store/playerStore.ts`         | All playback state — 38 downstream consumers                 |
| `web/src/store/queueStore.ts`          | Queue/history invariants; prev() pops TWO items              |
| `web/src/lib/constants.ts`             | `API_BASE` and `WS_URL` — prod vs dev switching              |
| `web/capacitor.config.ts`              | `allowMixedContent`, `CapacitorHttp` — breaks APK if wrong   |
| `web/vite.config.ts`                   | Proxy config, PWA manifest, chunk splitting                  |

---

## Known Problems

### 1. Track ID changes after download

- Search result has `id = videoId` (YouTube). After download, library scan produces `id = MD5(path)`.
- Same song appears twice — once as streamed (YouTube ID), once as local (MD5 ID).
- `isDownloaded` on search results is unreliable because the IDs don't match.
- **Root cause:** no stable universal ID linking a YouTube track to its local file.

### 2. Jobs lost on server restart

- `_jobs` is in-memory. Active downloads shown in the UI disappear after server restart.
- Files themselves survive (on Termux), but the activity feed is blank.

### 3. Render free tier ephemeral disk

- `MUSIC_DIR=/tmp/Rheoson/music` on Render — files gone on restart/redeploy.
- Render is effectively streaming-only (yt-dlp pipe) in this config.

### 4. No playlist track deduplication

- Adding the same track to a playlist twice works — the list stores IDs, doesn't deduplicate.

### 5. Artwork for downloaded tracks only served if local

- `GET /stream/{id}/artwork` returns 404 for YouTube tracks (not downloaded).
- Frontend falls back to `artworkUrl` from the search result (YouTube CDN URL).

### 6. YTMusic singleton failure is permanent

- If `YTMusic()` fails at startup (network error), `_ytm_error` is set and all searches fail for the lifetime of the process. No recovery without restart.

### 7. Settings Spotify creds written to `.env` at runtime path

- `settings.py` computes `.env` path relative to the file's location. On Render, `/tmp` means the file doesn't survive restart, so Spotify creds also don't survive.

### 8. Stream cache rebuilt from all music dirs on every invalidation

- `_build_cache_sync` scans all `settings.all_music_dirs`. If EXTRA_MUSIC_DIRS contains `/sdcard/Music` and the user has thousands of files there, the rebuild is slow.

### 9. WebSocket auto-connect on app load

- The singleton socket was previously `autoConnect: true`, meaning it connected even when no component used it. Now fixed: lazy connection via ref-counting, only connects when the first consumer mounts.

---

## V2 Objectives

Based on the codebase state and known issues, V2 should address:

1. **Stable track identity** — link YouTube videoId to downloaded file via a sidecar JSON or SQLite; `isDownloaded` becomes reliable, no duplicate entries
2. **Persistent job store** — write download jobs to disk (SQLite or JSON); survived restart
3. **User accounts / multi-user** — currently hardcoded single-user; prep for session-based access if self-hosting for family
4. **Playlist track objects** — store full track metadata in playlist, not just IDs (faster load, no re-hydration)
5. **Background download on Android** — current APK loses downloads when WebView goes to background; needs Capacitor background task or a proper service
6. **YTMusic auth** — ytmusicapi supports authenticated cookies for higher rate limits and personalised results
7. **Library deduplication** — detect and merge duplicate files (same track downloaded twice in different formats)
8. **Streaming for non-MP3 formats** — yt-dlp pipe hardcodes `--audio-format mp3 --audio-quality 192K`; should respect user format settings
9. **Search result `isDownloaded` flag** — needs the stable ID system from #1 to work
10. **Render persistence** — move from Render free to a VPS or use Render's persistent disk; the ephemeral disk makes downloads useless there

---

## Architecture Notes

### Version Consistency

All four version numbers must stay in sync:
- `api/pyproject.toml` → `version = "2.11.0"`
- `web/package.json` → `"version": "2.11.0"`
- `web/src/lib/constants.ts` → `APP_VERSION = "2.11.0"`
- `api/app/main.py` → `VERSION = "2.11.0"`

### CORS Policy

- `_BUILTIN_ORIGINS` in `main.py` lists hardcoded allowed origins (no wildcard `"*"`, no `"null"`)
- `CORS_ORIGINS` env var adds extra origins additively — never replaces builtins
- Socket.IO uses the same origin list for its CORS config
- The `null` origin was removed as a security fix — it could allow origin-spoofing attacks

### Path Traversal Protection

The `/api/settings/directories/browse` endpoint validates that the requested path resolves within a configured music directory. Requests outside those directories return 403.

### WebSocket Lifecycle

- Lazy connection: the socket only connects when the first React component mounts via `useWebSocket()`
- Ref-counting: each consumer increments `_refCount` on mount, decrements on unmount; socket disconnects when count hits 0
- Pending event queue: events emitted before `ws_manager.init(sio)` on the backend are queued and flushed on startup

### Why `socket_app` not `app` as uvicorn target

Socket.IO is an ASGI middleware wrapping FastAPI. `uvicorn app.main:socket_app` is required. `app` bypasses the wrapper and breaks all WS events. This is also why `render.yaml` and `docker-compose.yml` specify `socket_app` explicitly.

### Why `html5: true` in Howler

Capacitor WebView on Android doesn't support Web Audio API decoding for large audio files. `html5: true` uses the native `<audio>` element which supports HTTP range requests and proper background audio on mobile.

### Why downloads go to `MUSIC_DIR` not `DOWNLOADS_DIR`

The library scanner reads `MUSIC_DIR`. Files written to `DOWNLOADS_DIR` would never appear in `/tracks` or `/tracks/recently-played`. This was a bug in an earlier version — files now land in `MUSIC_DIR/<Artist>/<Title>.<ext>` directly.

### Why no database

Self-hosted, single-user, Termux-first. SQLite would be the right call for V2 (stable IDs, query-able history, job persistence), but V1 uses flat JSON files and in-memory dicts to stay dependency-light and deployable anywhere with just `pip install`.

### Why `injectManifest` PWA strategy

`generateSW` (the other vite-plugin-pwa option) would regenerate `sw.ts` and overwrite custom Workbox routes. `injectManifest` lets us own the SW file entirely and Workbox only injects `__WB_MANIFEST` at build time.

### Why playlists store track IDs not track objects

Avoids data duplication and stale artist/album metadata. Trade-off: playlist page requires hydrating each track ID individually (concurrently with `asyncio.Semaphore(10)`). V2 should cache hydrated results.

### Why `API_BASE = /api` in dev vs full URL in prod

Vite dev server proxies `/api` and `/socket.io` to `127.0.0.1:8000`. The proxy handles CORS. In prod (Render or APK), there's no proxy, so we need the full URL baked in at build time via `VITE_API_URL`.

---

## Dev Environment Notes

- Backend runs from `api/` with `uv run uvicorn app.main:socket_app --reload` or via Docker
- Frontend runs from `web/` with `npm run dev` (port 3000, proxies to :8000)
- Termux-first: Python deps installed with `pip install -e . --break-system-packages` or `uv sync`
- For APK testing: `RHEOSON_DEV_URL=http://<machine-LAN-IP>:3000 npx cap run android`
- Service worker is OFF in dev — HMR and SW conflict

**Package manager:** `npm` (frontend), `uv` or `pip` (backend). Not pnpm — this project predates the pnpm convention in LETHABO_STANDARDS.

---

_This file is generated from source. Regenerate after significant structural changes._
