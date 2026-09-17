# Dependencies — What Every Library Is For

*Stage 8. Nobody memorizes libraries. But you should be able to see an import and know what it's doing here. Everything below is actually in `web/package.json` or `api/pyproject.toml` — official docs linked at [19](../19-official-docs/index.md).*

## The frontend stack (`web/package.json`)

### Core

| Package | What it does here |
|---|---|
| **react**, **react-dom** | Draws the UI. Components = functions returning JSX. |
| **react-router-dom** | URL → page mapping (`router.tsx`), `useParams`, `useNavigate`. |
| **typescript** | The type layer over JavaScript; `npm run build` typechecks first. |
| **vite** | Dev server (with `/api` proxy to :8000) and production bundler. |
| **@vitejs/plugin-react** | Teaches Vite JSX + fast-refresh. |

### State & data

| Package | What it does here |
|---|---|
| **zustand** | App-wide stores (player, queue, downloads, ui, theme, auth). Tiny, selector-based. |
| **@tanstack/react-query** | Server-cache for GET data: search results, library, analytics. Gives loading/error state, caching, deduping. If a page uses `useQuery`, it's read-mostly data. |
| **socket.io-client** | Live download progress (`websocket.lib.ts` singleton). |

### Media & UI

| Package | What it does here |
|---|---|
| **howler** | Audio playback engine. One global `Howl` per track, `html5: true` for Android range-request support (the double-play bug lived here — see CLAUDE.md). |
| **framer-motion** | Enter/exit animations (`AnimatePresence` in lists, sheets, toasts). |
| **lucide-react** | Every icon you see. `import { Play, Pause } from 'lucide-react'`. |
| **tailwindcss** (+ `tailwind-merge`, `clsx` via `cn()`) | Styling. Utility classes in JSX; `cn()` merges conflicting classes safely. |
| **@radix-ui/** components | Accessible primitives (dialogs, sliders) behind our `components/ui` wrappers. |
| **vite-plugin-pwa** (Workbox) | Service worker: offline audio cache (CacheFirst + Range), API NetworkFirst, app shell. |

### Native shell & auth

| Package | What it does here |
|---|---|
| **@capacitor/core**, **@capacitor/android**, **@capacitor/cli** | Wraps the built frontend into the Android APK; JS↔native bridge (`DownloadForeground` plugin). |
| **@clerk/clerk-react** | Sign-in UI + session tokens. The backend verifies the tokens Clerk issues. |

### Dev & test

| Package | What it does here |
|---|---|
| **vitest** | Unit test runner (`npm test`) — same syntax family as Jest. |
| **eslint** (+ typescript-eslint) | Lint; CI fails on warnings. |
| **openapi-typescript** | Generates `src/types/api-generated.ts` from the backend's OpenAPI snapshot. |
| **@capacitor/assets** (or ImageMagick scripts) | Brand/icon generation pipeline. |

## The backend stack (`api/pyproject.toml`)

### Core

| Package | What it does here |
|---|---|
| **fastapi** | The web framework: routes, validation, `/docs`, dependency injection. |
| **uvicorn** | The server process running the ASGI app (`app.main:socket_app`). |
| **pydantic**, **pydantic-settings** | Response/request models; typed env config from `.env` (`core/config.py`). |
| **python-socketio** | WebSocket layer (download progress, heartbeat). |
| **apscheduler** | The three cron jobs in `main.py` (scan, yt-dlp update, job cleanup). |

### Data & media

| Package | What it does here |
|---|---|
| **motor** (+ **pymongo**) | Async MongoDB driver. Every `await db.<collection>…` you'll see. |
| **yt-dlp** | Downloads and stream-URL extraction. Used as a *library* (in executors) and inspected by the client-ladder logic. |
| **ytmusicapi** | YouTube Music search/browse client (unofficial). The singleton in `ytmusic_service.py`. |
| **mutagen** | Reads/writes audio tags (ID3, m4a, flac) — powers metadata and `write_tags`. |
| **syncedlyrics** | Lyrics provider feeding `lyrics_service`. |

### Auth, networking, ops

| Package | What it does here |
|---|---|
| **svix** | Verifies Clerk webhook signatures (`/api/webhooks/clerk`). |
| **httpx** | Async HTTP client — Clerk Backend API calls, keep-alive pings, SSRF-guarded fetches. |
| **structlog** | Structured JSON logs (the `"event": "stream.relay.cached"` lines). |
| **cryptography** | JWT/JWK verification support. |
| **pytest**, **pytest-asyncio**, **pytest-timeout** | The test suite and its async/timeout handling. |
| **ruff** / **pyflakes** | Python lint gate. |
| **uv** | Fast pip-compatible manager; `uv lock` maintains `uv.lock`. |

## Reading dependency diffs in review

A PR that adds an import should usually add the package in the same diff — and a PR that adds a package should answer: *what does it do that the existing stack can't?* Red flags: two libraries doing the same job (two state managers), a heavy package for one tiny function, a package pinned with `*`. The install command goes in the PR description along with why.

## Exercises

1. `grep -rn "framer-motion" web/src --include="*.tsx" -l | head` — open two files. What animates? Would the UI lose *meaning* without it (bad) or just flourish (fine)?
2. Find where `socket.io-client` connects (`websocket.lib.ts`). Why is there a ref-count (`_refCount`)?
3. Pick one package from each table and find its single import site. One file or many? What does that tell you about the abstraction?
4. In `api/pyproject.toml`, find the pinned versions of yt-dlp and ytmusicapi. Why do you think yt-dlp updates are also a *cron job*?
