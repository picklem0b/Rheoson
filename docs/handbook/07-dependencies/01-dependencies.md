# Chapter 11 — Dependencies

*Part III · The Codebase*

---

Every external library is a trade: capability gained, control and audit surface surrendered. This chapter covers the dependencies that matter, in three tiers — architectural (the app's shape would change without them), functional (replaceable with effort), and utility (small and boring, on purpose). For each: what it does, why this project chose it, where it lives in the code, and where its official documentation begins. Declarations live in `web/package.json` and `api/pyproject.toml`, with exact versions pinned by `web/package-lock.json` and `api/uv.lock`.

## 11.1 Architectural — the shape of the app

**React** (`react`, `react-dom`) renders the interface as components — Chapter 7 is the deep dive. Chosen over framework alternatives for its component model and ecosystem; nearly every frontend file is a component or a hook.
Docs: https://react.dev/learn

**React Router** (`react-router-dom`) maps URLs to pages — the route table in `web/src/router.tsx`, nested layouts, the fullscreen route outside the shell. The declarative table is deliberately centralized so route structure is reviewable in one screen.
Docs: https://reactrouter.com/

**Zustand** (`zustand`) is the state layer — Chapter 7.13's stores. Chosen over Redux-class tools for its size and its selector model: components subscribe to one field and re-render only on that field's change, which matters when a progress timer updates four times a second.
Docs: https://zustand.docs.pmnd.rs/

**TanStack Query** (`@tanstack/react-query`) owns server-state cache and lifecycle — deduplication, staleness, refetch windows, mutations with rollback (8.4's optimistic like). It removes the fetch-effect boilerplate the codebase would otherwise repeat in a dozen hooks.
Docs: https://tanstack.com/query/latest

**FastAPI** (`fastapi`) is the backend's HTTP framework — decorators into routes, type hints into validation, Pydantic models into schemas and the OpenAPI document the frontend's generated types come from (5.6). The signature-driven design is why backend routes are three lines of contract and one line of delegation.
Docs: https://fastapi.tiangolo.com/

**Socket.IO** (`python-socketio` server, `socket.io-client` frontend) is the push channel — download progress, done/error events, health pings — over the persistent connection managed by Chapter 9.7's two singletons. Plain WebSockets would have required rebuilding reconnection, acknowledgment, and fallback behavior the library provides.
Docs: https://socket.io/docs/v4/

**Motor + Pydantic** (`motor`, `pydantic`) are the data tier's two halves — async MongoDB access (Chapter 10.2) and validated models at every boundary (6.6). Pydantic ships inside FastAPI's contract but earns its own entry: schemas in `api/app/schemas/` are the API's public type system.
Docs: https://www.mongodb.com/docs/languages/python/pymongo-driver/current/ · https://docs.pydantic.dev/

## 11.2 Functional — capability, swappable with effort

**Howler.js** (`howler`) is the audio engine: one module-level instance (7.7's singleton), `html5: true` for native `<audio>` behavior — the Capacitor WebView cannot decode large files through Web Audio, and HTML5 audio supports the range requests that seeking requires. The format hint and HEAD-probe logic in `player.hook.ts` exists because Howler refuses to guess formats.
Docs: https://github.com/goldfire/howler.js#documentation

**yt-dlp** (`yt-dlp`) resolves and extracts media from YouTube and a hundred other sites — the download pipeline's core (9.6) and the streaming fallback's engine (9.5). It is also the project's most maintenance-sensitive dependency: YouTube changes, the extractor races, and the daily self-update cron exists precisely because a stale yt-dlp is the leading cause of "downloads stopped working." Its **player-client ladder** (trying extraction clients in order) is written against this dependency's documented options.
Docs: https://github.com/yt-dlp/yt-dlp#readme

**ytmusicapi** (`ytmusicapi`) is the unofficial YouTube Music client — search, charts, album/artist lookup. Unofficial means unstable: responses are validated on read, the singleton fails fast when the API misbehaves (9.3), and executor offload wraps its synchronous calls.
Docs: https://ytmusicapi.readthedocs.io/

**Clerk** (`clerk-backend-api`, frontend API) provides authentication: JWT issuance and verification, user management, webhook signing. The codebase treats it as a boundary — tokens verified on every protected call (9.9), webhooks verified before any user record changes — so the provider could in principle be exchanged without touching business logic.
Docs: https://clerk.com/docs

**Capacitor** (`@capacitor/core`, `@capacitor/android`) packages the web build into a native Android shell — Chapter 12's whole subject. `allowMixedContent` and the native HTTP bridge are its two load-bearing settings here.
Docs: https://capacitorjs.com/docs

**Vite** (`vite`, `@vitejs/plugin-react`) builds and serves the frontend: dev server with proxy and instant reload (3.8), production bundling with chunk splitting, and the PWA plugin that compiles the service worker. The build is also where environment truth is baked in (12.4).
Docs: https://vite.dev/guide/

**Tailwind CSS** (`tailwindcss`) styles via utility classes in JSX — the reason UI review happens in class strings rather than stylesheets, and the theme system (CSS variables per theme in `web/src/themes/`) integrates through it.
Docs: https://tailwindcss.com/docs

**mutagen** (`mutagen`) reads and writes audio metadata — tags, embedded artwork, durations — behind `metadata_service.py`. Its format-specific backends are why MP3/FLAC/M4A/OGG all tag correctly from one code path.
Docs: https://mutagen.readthedocs.io/

**APScheduler** (`apscheduler`) runs the three cron jobs inside the process (9.8) — no external scheduler, one fewer moving part to deploy.
Docs: https://apscheduler.readthedocs.io/

**Workbox** (via `vite-plugin-pwa`) powers the service worker's caching strategies — cache-first artwork and audio (with range-request support), network-first API, stale-while-revalidate shell — the offline half of Chapter 12.4.
Docs: https://developer.chrome.com/docs/workbox/

## 11.3 Utility — small, boring, chosen on purpose

`clsx` + `tailwind-merge` compose conditional class strings (`cn()`, 8.5's most-connected function); `framer-motion` animates the few transitions the design keeps (the iOS-feel direction is *fewer*, purposeful ones); `lucide-react` supplies the icon set; `lru-cache` backs the remote stream cache's TTL; `structlog` structures backend logs into the fields the Doctor reads; `uvicorn` serves ASGI (always pointed at `socket_app` — 9.1's rule); `httpx` makes backend-side HTTP calls async so prewarm never blocks; `vitest` + `pytest` are the test runners of Chapter 16; and `eslint` + the Python type checker are the automated half of every review in Chapter 20.

## 11.4 Adding and removing dependencies

The recipes, since dependency changes are the most common first contribution (the full versions are Chapter 17):

1. Justify it against 11.1–11.3 — does a capability this size already exist here?
2. Add to the right manifest (`web/package.json` / `api/pyproject.toml`); let the lockfile pin (`npm install` / `uv lock`).
3. Wire it behind the existing boundary: a UI library enters via `components/ui/`, an API wrapper via its own module — never sprinkled.
4. Note it in this chapter if it is architectural or functional; the chapter is the dependency review's checklist.
5. Removing: delete usages first, then the declaration, then re-lock. A dependency in the manifest with no import is dead weight with a supply-chain surface.

## Exercises

1. For each, name the tier and the alternative the project declined: Zustand; yt-dlp; `clsx`; Socket.IO.
2. Find the Howler instantiation in `player.hook.ts`. Which of its options is Android-specific, and what breaks on device without it?
3. The yt-dlp self-update cron stops running silently for a month. Which user-facing symptom appears first, and which section of this chapter predicted it?
4. Trace one OpenAPI round trip: a new field in a Pydantic schema to the frontend's generated types — name every tool in the chain.
5. A proposed dependency promises "state management + data fetching + routing." Using 11.4's step 1, write the three-line rejection or acceptance argument.
