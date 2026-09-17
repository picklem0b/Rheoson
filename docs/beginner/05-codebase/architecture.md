# Codebase Architecture — The Whole Map

*Stage 5. After this document you should be able to open any folder in the repository and know why it exists.*

## 1. The 10,000-meter view

```
┌────────────────────────────────────────────────────────────┐
│ Android APK (Capacitor WebView)  ·  or any browser         │
│                                                            │
│  React app (web/src)                                       │
│   pages/ → components/ → hooks/ → api/ → lib/              │
│      │                              │                      │
│      │  fetch (JSON over HTTP)      │  Zustand stores      │
│      └──────────────┬───────────────┘  (player, queue,     │
│                     │                 downloads, UI, theme)│
└─────────────────────┼──────────────────────────────────────┘
                      │ /api/*  ·  /socket.io (WebSocket)
┌─────────────────────▼──────────────────────────────────────┐
│ FastAPI backend (api/app)                                  │
│   routers/ → services/ → (MongoDB · file system · yt-dlp)  │
│   websocket/ — download progress events                    │
└────────────────────────────────────────────────────────────┘
```

Two programs, one contract. The frontend owns *everything the user sees and touches*; the backend owns *everything that must survive* (files, accounts, history) and *everything that needs server power* (search fanout, yt-dlp downloads, streaming pipes).

## 2. Repository tree, annotated

```
Rheoson/
├── api/                        THE BACKEND (Python 3.13, FastAPI)
│   ├── app/
│   │   ├── main.py             App entry: mounts routers, CORS, cron jobs
│   │   ├── core/               config.py (env settings), deps.py (auth),
│   │   │                       auth.py (Clerk JWT verify), logging
│   │   ├── routers/            One file per URL area — thin HTTP layer
│   │   │   ├── search_router.py      /api/search, /categories, /resolve
│   │   │   ├── track_router.py       /api/tracks, liked, history, trending
│   │   │   ├── stream_router.py      /api/stream/{id}/audio — the big one
│   │   │   ├── download_router.py    /api/downloads — job CRUD
│   │   │   ├── playlist_router.py    /api/playlists — CRUD per user
│   │   │   ├── auth_router.py        /api/auth — Clerk login, prefs, visitors
│   │   │   └── …                     lyrics, equalizer, share, analytics
│   │   ├── services/           Business logic (routers delegate here)
│   │   │   ├── download_service.py   yt-dlp orchestration, job lifecycle
│   │   │   ├── stream_service.py     URL resolution, ranges, upstream relay
│   │   │   ├── ytmusic_service.py    YouTube Music client (singleton)
│   │   │   └── …                     metadata (mutagen), lyrics, artwork
│   │   ├── schemas/            Pydantic models = response shapes
│   │   └── websocket/          Socket.IO manager + download events
│   ├── tests/                  pytest suite (see 12)
│   └── pyproject.toml          Python dependencies + metadata
│
├── web/                        THE FRONTEND (React 18 + Vite + TypeScript)
│   ├── src/
│   │   ├── pages/              One folder per URL route (Home, Search, …)
│   │   ├── components/         Shared UI: layout/, player/, ui/ primitives
│   │   ├── hooks/              Reusable behavior (usePlayer, useDownloads…)
│   │   ├── store/              Zustand stores (player, queue, downloads…)
│   │   ├── api/                Typed fetch wrappers (client.api.ts + per area)
│   │   ├── lib/                Framework-free helpers (constants, utils, network)
│   │   ├── types/              Shared TS shapes + generated API types
│   │   └── __tests__/          Vitest unit tests
│   ├── android/                Native Android project (Capacitor output)
│   ├── scripts/                Icon generation, build guards
│   └── package.json            npm dependencies + scripts
│
├── docs/                       Human documentation (you are here)
├── nginx/                      Reverse proxy for Docker deployments
├── docker-compose*.yml         Dev / prod / VPS stacks
├── render.yaml                 Render.com deploy config (cloud backend)
├── .github/workflows/          CI: APK build on push to main
└── GIT_WORKFLOW.md             Branch + tag conventions (v2.MILESTONE.PHASE)
```

## 3. The frontend's layer rules (why files are where they are)

Data flows through strict layers; a component never calls `fetch` directly:

```
pages/  and  components/      ← JSX only; compose + render
        ↓ call
hooks/  (usePlayer, useDownloads…)   ← behavior: state + effects
        ↓ call
store/  (Zustand)             ← app-wide state, survives navigation
        ↓ call
api/    (tracks.api, …)       ← typed fetch calls, one function per endpoint
        ↓ built by
lib/constants.ts              ← API_BASE, endpoints, storage keys
```

**Consequences worth memorizing:**
- To find what happens on a tap: start in the page, jump to the hook it calls, then the api module. Three hops, always the same shape.
- `lib/` never imports React. If a helper needs React, it's a hook, not lib.
- The same endpoint is called from exactly one api module — search the codebase for a URL string and you'll find the wrapper, not 15 call sites.

## 4. The backend's layer rules

```
HTTP request
   ↓
routers/      parse + validate + delegate (no business logic here)
   ↓
services/     the actual work: yt-dlp, files, Mongo, ytmusic
   ↓
MongoDB · file system · external APIs
```

- **Pydantic schemas** (`app/schemas/`) declare response shapes; FastAPI turns Python dicts into JSON and generates `/docs` from them.
- **Auth** enters via dependencies: `Depends(get_current_user)` (must be signed in) or `Depends(get_optional_user)` (guest OK — the guest-first matrix lives in `tests/test_guest_policy.py`).
- **Services are singletons** where they hold expensive state (the YTMusic client, the download semaphore).

## 5. Where state lives (the full inventory)

| State | Lives in | Survives restart? |
|---|---|---|
| Current track, volume, repeat | `web/src/store/player.store.ts` (persisted) | yes (localStorage) |
| Queue + history | `web/src/store/queue.store.ts` (memory) | no |
| Download jobs UI | `web/src/store/download.store.ts` (persisted) | yes |
| Panels, modals | `web/src/store/ui.store.ts` | partially |
| Theme | `web/src/store/theme.store.ts` | yes |
| Auth session | `web/src/store/auth.store.ts` | yes |
| Music files | server disk (`MUSIC_DIR`) | yes (Termux/VPS), no (Render free) |
| Playlists, likes, history | MongoDB (per user) | yes |
| Download jobs (server) | in-memory `_jobs` + JSON sidecar | yes |
| Stream cache | `STREAM_CACHE_DIR` on disk | yes |

## 6. Two data flows worth tracing end to end

### Playing a track (the hot path)

```
tap row → LibraryTrackRow.handlePlay
  → useQueue().playTrack(track, queue)      store: queue + player.setTrack
  → usePlayer().loadAndPlay(id)             hook: Howler singleton
    → tracksApi.getStreamUrl(id)            resolves /api/stream/{id}/audio
      → FastAPI stream_router               local file? serve it (range support)
        else resolve YouTube → relay CDN, tee into cache
  → Howler plays → progress timer → playerStore.progress
```

### Downloading a track

```
DownloadModal → useDownloads().download(track)
  → POST /api/downloads (202 Accepted, job id)
  → download_service spawns yt-dlp (semaphore-limited)
  → Socket.IO events: download:progress → ws.on → downloadStore.updateJob
  → done: tags written, caches invalidated, track appears in library
```

**Exercise:** open the three files in each flow and put breakpoints (or `console.log`) at each hop. Watch the app do exactly the diagrams above.

## 7. The identity quirk (project-specific, important)

A YouTube track's id is its 11-char videoId. After download, the *file* gets an id derived from its path (md5[:16]). The `track_identity` SQLite sidecar maps one to the other so search results and your library agree on what's downloaded. If you ever see "the same song twice" bugs, this map is the first suspect.

## 8. Where tests live and what they pin

- `api/tests/` — pytest. Endpoint contracts (`test_guest_policy.py`), streaming (`test_stream_service.py`), downloads ladder, per-user isolation.
- `web/src/__tests__/` — Vitest. Pure logic (`utils`, `formatters`), decision functions (`apiTarget`), cache migration.
Rule from CONTRIBUTING.md: a bug fix lands with the test that would have caught it.

## 9. Reading order when you open the repo cold

1. `web/src/App.tsx` — everything the app boots
2. `web/src/router.tsx` — every screen
3. `web/src/lib/constants.ts` — every endpoint + env var
4. `api/app/main.py` — the backend's front door
5. `api/app/routers/track_router.py` + `web/src/api/tracks.api.ts` — one full vertical slice

## Exercises

1. Draw (paper is fine) the layer each of these lives in: `formatDuration`, `useDownloads`, `downloadStore`, `tracks.api.ts`, `DownloadModal`.
2. Find one component that imports from `store/` and one that imports from `hooks/`. Which one would you put new playback logic in, and why?
3. Trace `/api/search` from the Search page to `ytmusic_service` and back. List the files in order.
