# Chapter 8 — Codebase Architecture

*Part III · The Codebase*

---

This chapter is the map: every major directory, what each part owns, where state lives, and how a feature travels end to end. The companion chapters zoom in — Chapter 9 on the backend, Chapter 10 on data, Chapter 12 on mobile — but this is the one to return to whenever a file feels homeless.

## 8.1 The ten-thousand-meter view

```
┌──────────────────────────────────────────────────────────────┐
│  Android APK (Capacitor WebView)   ·   any desktop browser    │
│                                                              │
│   React SPA (web/src)                                        │
│    pages → components → hooks → stores → api/*               │
│         │                                    │               │
└─────────┼────────────────────────────────────┼───────────────┘
          │ HTTP /api/*          Socket.IO /socket.io
          ▼                                    ▲
┌──────────────────────────────────────────────────────────────┐
│   FastAPI backend (api/app)                                  │
│    routers → services → core         websocket/ ── push ──►  │
│         │                │                                   │
│         ▼                ▼                                   │
│   MongoDB (Atlas)    yt-dlp + file system (MUSIC_DIR)        │
└──────────────────────────────────────────────────────────────┘
```

Two programs, three channels between them: request/response over HTTP for everything the frontend asks; a persistent Socket.IO connection over which the backend pushes (download progress, connection health); and the audio stream itself, which is HTTP with range support and is deliberately not JSON. Everything below exists to keep those channels honest.

## 8.2 The repository, directory by directory

**Root — one file per concern.**

| Path | Owns |
|---|---|
| `CLAUDE.md` | the codebase's own map, versioned with the code — the fastest orientation read |
| `ARCHITECTURE.md` / `docs/` | long-form documentation, including this handbook |
| `GIT_WORKFLOW.md` | branches, tags, releases — the process contract |
| `docker-compose*.yml`, `render.yaml`, `Caddyfile`, `nginx/` | the three deployment shapes (dev, prod, VPS) — Chapter 18 |
| `Makefile`, `scripts/` | task automation shared across environments |
| `api/`, `web/` | the two programs — everything else exists to build or run them |

**`api/` — the backend.**

```
api/
├── app/
│   ├── main.py            # assembly: FastAPI app, Socket.IO wrapper, routers, cron
│   ├── core/              # config, logging, exceptions, deps — no business logic
│   ├── routers/           # HTTP shells: validate, delegate, respond
│   ├── services/          # business logic: download, ytmusic, search, metadata, …
│   ├── schemas/           # Pydantic response models — the API's public contract
│   ├── models/            # MongoDB document shapes
│   └── websocket/         # connection manager + event push
├── tests/                 # pytest suite — services under test, not HTTP
└── pyproject.toml         # dependencies, entry point
```

**`web/` — the frontend.**

```
web/src/
├── main.tsx / App.tsx     # React entry: providers, router
├── router.tsx             # URL → page mapping
├── pages/                 # route-level screens; one folder per page
├── components/            # shared UI: layout/, player/, ui/ primitives
├── hooks/                 # reusable behavior: player, queue, downloads, search, …
├── store/                 # Zustand stores — the state layer
├── api/                   # typed HTTP wrappers — the only fetch() in the app
├── lib/                   # pure utilities and platform glue: formatters, haptics, websocket
├── types/                 # Track, DownloadJob, generated API types
└── themes/                # CSS variable sets for theming
```

The layering rules that keep both trees navigable, stated as the review checks they enable: pages import hooks and components, never each other; components never import pages; `api/` is the only module that touches `fetch`; stores never import components; `lib/` imports nothing above it. A cycle or a shortcut through these arrows is a finding, because each arrow crossing is what makes a feature findable later.

## 8.3 Where state lives

Every piece of state in the application has exactly one home. The table is the codebase's most useful debugging aid: "where does X live" is half of every bug report about X.

| State | Home | Persistence | Notes |
|---|---|---|---|
| Current track, volume, repeat, saved position | `store/playerStore.ts` | persisted fields in localStorage | the most-connected store in the app |
| Queue, history, shuffle order | `store/queueStore.ts` | memory only | `originalQueue` survives shuffle |
| Download jobs (UI view) | `store/downloadStore.ts` | done/error persisted | live progress arrives via Socket.IO |
| UI panels, modals | `store/uiStore.ts` | sidebar only | queue and lyrics panels are exclusive |
| Theme | `store/themeStore.ts` | persisted | drives CSS variables |
| Auth session | auth store + token | persisted | injected by the API client |
| Server data (tracks, search, playlists) | TanStack Query cache | memory | keyed, deduplicated, stale-while-refetch |
| Audio engine (Howler instance, timers) | module scope in `player.hook.ts` | memory | outside React by design (7.7) |
| Tracks, likes, playlists, history | backend: `MUSIC_DIR` JSON sidecars | disk | single-writer, file-based |
| Users, recommendations, analytics | MongoDB | Atlas | multi-entity, queryable |
| In-flight job progress | backend `_jobs` + push | memory | lost on restart by design |

The division of labor between stores and hooks is the pattern to internalize: **stores own state and actions; hooks adapt them for components** (`usePlayer()` wraps `playerStore`); **components subscribe with selectors** and never hold a copy of shared state locally. When two components need the same value, the value moves *down* into a store, not *up* into a common parent — the codebase's consistent answer to prop-drilling.

## 8.4 How a feature flows

One feature, traced through every layer — "the like button":

```
UI        LikedToggle (component)
            │ onClick
hook      uses a mutation from TanStack Query
            │ optimistic: set liked=true now, roll back on failure
api       tracksApi.like(id) → POST /api/tracks/{id}/like
            │
backend   track_router → service updates MUSIC_DIR/.liked.json
            │ returns 200
react     query cache invalidated → every liked-view refetches
```

And the variant with push — "a download completes": backend `download_service` finishes → `websocket/ws_manager` emits `download:done` → the frontend's socket singleton (8.5) dispatches to the registry → `downloadStore` updates the job → the query cache invalidates → the library list shows the new track with no user action. Both flows answer the same review question — *when this breaks, which layer do I open first?* — by making each layer's responsibility explicit.

## 8.5 The connective tissue

Three mechanisms span layers and deserve naming before the deep dives:

**The API client** (`web/src/api/client.ts`) — every request passes through one module that attaches the base URL and auth header, parses responses, converts failures to `ApiError`, and supports abort. It is the single point that knows what "the backend" means, which is why environment mistakes are one-file fixes.

**The WebSocket singleton** (`web/src/lib/websocket.lib.ts`) — one connection for the whole app, lazily connected and reference-counted so it disconnects when the last consumer unmounts; a registry deduplicates handlers across re-renders. Any code needing server push goes through it rather than opening sockets, and the history of the "duplicate handler" bug class is why the registry exists.

**The dependency graph's hubs.** A handful of nodes dominate: `cn()` (used by every component), `formatDuration` (every track row), `playerStore` (all playback), the API client (all data). Blast radius follows: a change to a hub is a change everywhere, so hubs earn their stability with tests and conservative APIs. The project's "critical files" list in `CLAUDE.md` is exactly this graph made explicit.

## 8.6 Tests and configuration

Tests mirror the programs, each suite testing *inside* its layer: `api/tests/` exercises services and routers with a fake database (no MongoDB required) and pins the auth/guest policy; `web/src/__tests__/` runs Vitest over pure utilities (`formatters`, `utils`, `haptics`) and frontend contracts. The deeper material — how to read and write both suites — is Chapter 16.

Configuration follows the boundary rule from Chapter 3.7: everything that varies per environment enters through `.env` files (backend, runtime) or `VITE_*` variables (frontend, build time), is typed in `core/config.py` or `vite-env.d.ts`, and is documented in `.env.example` templates. Nothing reads `process.env` or `os.environ` ad hoc; a new setting joins the typed config or it does not exist.

## 8.7 Finding anything

A search algorithm that resolves most "where is X implemented" questions in under a minute:

1. **User-visible string?** `grep -r "the exact string"` — labels are the fastest anchor into the UI tree.
2. **Route or endpoint?** `router.tsx` (frontend) or the decorator line in `routers/` (backend).
3. **Event name?** Socket events are defined once on the backend (`websocket/`) and consumed via the singleton's registry.
4. **A piece of state?** Section 8.3's table, then the store file.
5. **Behavior on tap/click?** The component's `onClick` names a handler; the handler names the hook; the hook names the store or API module.

Reading order for a new feature request: find the nearest existing feature (step 1–3), read its vertical slice UI → hook → api → router → service, and copy the slice. The codebase is deliberately uniform; new code that follows an existing slice reviews faster and breaks less.

## Exercises

1. For each, name the home from 8.3 before looking: shuffle order; the theme; a playlist's title; a running download's percentage; the audio engine.
2. The like flow in 8.4 is optimistic. Find the rollback path in the code and describe the user-visible difference if it were removed.
3. Pick a page and list every import above its component declaration, sorted by layer. Which rule from 8.2 would each violation (if any) break?
4. Trace "user taps a search result" through all layers without opening a single page file — using only the route table, the API modules, and the backend routers.
5. The websocket registry exists because of a real bug. State the bug's mechanism in one sentence, then find the code that prevents it.
