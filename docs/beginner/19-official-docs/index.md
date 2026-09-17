# Official Documentation Index

*Primary sources only — the pages maintained by the tools' authors. When a tutorial and one of these disagree, trust these.*

## Languages & runtimes

| Technology | Official docs | Notes |
|---|---|---|
| TypeScript | https://www.typescriptlang.org/docs/ | The Handbook is genuinely good; start at "The Basics". |
| Python | https://docs.python.org/3/ | The Tutorial + `asyncio` docs are what this backend relies on. |
| JavaScript (MDN) | https://developer.mozilla.org/en-US/docs/Web/JavaScript | MDN is the canonical JS reference (not a spec, better than one). |
| HTML/CSS (MDN) | https://developer.mozilla.org/ | Same source for DOM, fetch, media APIs. |

## Frontend framework & libraries

| Package | Official docs | Where it's used here |
|---|---|---|
| React | https://react.dev/learn | every component; `learn/` is the modern mental model |
| React Router | https://reactrouter.com/ | `web/src/router.tsx` |
| Zustand | https://github.com/pmndrs/zustand | `web/src/store/*` |
| TanStack Query | https://tanstack.com/query/latest | search/library/analytics reads |
| Howler | https://github.com/goldfire/howler.js#documentation | `hooks/player.hook.ts` — read the format-hint notes |
| Framer Motion | https://motion.dev/ | `AnimatePresence` transitions |
| Tailwind CSS | https://tailwindcss.com/docs | all styling; `cn()` lives in `lib/utils.ts` |
| Lucide | https://lucide.dev/ | icons |
| Radix UI | https://www.radix-ui.com/primitives | accessible primitives under `components/ui` |
| Socket.IO (client) | https://socket.io/docs/v4/client-api/ | `lib/websocket.lib.ts` |
| Vitest | https://vitest.dev/guide/ | `web/src/__tests__/` |
| ESLint | https://eslint.org/docs/latest/ | CI gate |
| Vite | https://vite.dev/guide/ | dev server + build; env vars docs matter here |
| vite-plugin-pwa / Workbox | https://vite-pwa-org.netlify.app/ · https://developer.chrome.com/docs/workbox/ | the service worker strategies in `sw.ts` |

## Backend framework & libraries

| Package | Official docs | Where it's used here |
|---|---|---|
| FastAPI | https://fastapi.tiangolo.com/ | every router; read "Dependencies" and "Request Files" |
| Pydantic | https://docs.pydantic.dev/ | schemas + settings (`core/config.py`) |
| Uvicorn | https://www.uvicorn.org/ | the ASGI server; note the `socket_app` target |
| Starlette (under FastAPI) | https://www.starlette.io/ | requests, responses, middleware underneath |
| python-socketio | https://python-socketio.readthedocs.io/ | the async server + emit patterns |
| Motor (Mongo async) | https://motor.readthedocs.io/ | every `await db.…` |
| MongoDB manual | https://www.mongodb.com/docs/manual/ | queries, aggregation, indexes |
| Atlas | https://www.mongodb.com/docs/atlas/ | the prod cluster |
| yt-dlp | https://github.com/yt-dlp/yt-dlp#readme | README + embedded-usage section; player-client notes explain the download ladder |
| ytmusicapi | https://ytmusicapi.readthedocs.io/ | search/browse calls in `ytmusic_service.py` |
| Mutagen | https://mutagen.readthedocs.io/ | tag read/write in `metadata_service.py` |
| APScheduler | https://apscheduler.readthedocs.io/ | the three cron jobs |
| structlog | https://www.structlog.org/ | JSON log lines |
| httpx | https://www.python-httpx.org/ | async client calls |
| Svix (webhook verify) | https://docs.svix.com/ | Clerk webhook signature checks |
| Pytest | https://docs.pytest.org/ | + `pytest-asyncio` docs for the async markers |
| Ruff | https://docs.astral.sh/ruff/ | Python lint gate |
| uv | https://docs.astral.sh/uv/ | dependency management, `uv lock` |

## Native, auth & infrastructure

| Technology | Official docs | Where it's used here |
|---|---|---|
| Capacitor | https://capacitorjs.com/docs | config, plugins, Android platform; read `CapacitorHttp` caveats |
| Android Developers | https://developer.android.com/ | foreground services, notifications, adaptive icons |
| Clerk | https://clerk.com/docs | backend verification + webhooks; token verification section |
| GitHub Actions | https://docs.github.com/actions | `build-apk.yml` |
| Docker / Compose | https://docs.docker.com/ · https://docs.docker.com/compose/ | the three compose files |
| nginx | https://nginx.org/en/docs/ | reverse proxy + the APK delivery route |
| Git | https://git-scm.com/book | Pro Git is free and complete |
| GitHub (PRs) | https://docs.github.com/pull-requests | review workflow |
| ImageMagick | https://imagemagick.org/script/command-line-tools.php | icon generation script |

## Standards worth knowing

- **HTTP semantics** — https://httpwg.org/specs/rfc9110.html (status codes, Range)
- **JSON** — https://www.json.org/
- **OpenAPI** — https://spec.openapis.org/
- **Web Audio / Media Session** — https://developer.mozilla.org/en-US/docs/Web/API

## How to read docs (a skill in itself)

1. **Search the official docs for the exact error/term** before any tutorial site.
2. Prefer the **"Getting started"** of the *version you use* (check `package.json`/`pyproject.toml` — v4 docs for a v3 package are a classic trap).
3. For behavior questions ("does HEAD work on FastAPI routes?"), the docs + a 30-second local experiment beat everything.
