# Infrastructure & Deployment — How Rheoson Reaches the World

*Stage 13. The same app runs in four places. Understanding *which* is talking to *what* explains half of all "works locally, broken there" reports.*

## 1. The full picture

```
                      ┌──────────────────────────────┐
   your phone ───────►│ Android APK (Capacitor)      │
                      │  web/android → build-apk.yml │
                      │  bundles web/dist + talks to │
                      │  the API over HTTPS          │
                      └──────────────┬───────────────┘
                                     │
        ┌────────────────────────────┼───────────────────────────┐
        ▼                            ▼                           ▼
┌───────────────┐          ┌──────────────────┐        ┌──────────────────┐
│ dev machine   │          │ Render (cloud)   │        │ a VPS (optional) │
│ Termux/local  │          │ rheoson-api-9e4c │        │ docker-compose   │
│ 127.0.0.1:8000│          │ .onrender.com    │        │ .vps.yml + nginx │
│ + mongod      │          │ + Atlas MongoDB  │        │ persistent disk  │
└───────────────┘          └──────────────────┘        └──────────────────┘
```

- **Backend** runs on your machine (Termux), or on Render (free tier: ephemeral disk), or on a VPS (persistent disk — the `docker-compose.vps.yml` stack).
- **Database**: local `mongod` in dev; **MongoDB Atlas** cluster in prod (`MONGODB_URL`).
- **Frontend**: either served from the APK itself, or as a static site (Render static / VPS nginx), or Vite dev server in development.
- **CI**: GitHub Actions builds a debug APK on every push to `main`.

## 2. Environments and how each resolves the API

The app must know where the backend lives. `web/src/lib/apiTarget.ts` decides, per build:

| Build | `VITE_API_URL` | Result |
|---|---|---|
| `npm run dev` | unset | Vite proxies `/api` → `127.0.0.1:8000` |
| APK / CI | set (or falls back to the canonical Render host) | absolute URL baked into the bundle |
| same-origin VPS | explicitly `''` | `/api` on the page's own origin (nginx proxies) |

This module exists because a build once shipped with a relative `/api` inside the APK — the WebView answered every request with `index.html`, which surfaced as "Backend returned HTML instead of JSON" everywhere. The unit tests in `apiTarget.test.ts` pin every combination, and `npm run verify` fails a build whose bundle lacks an absolute origin on native.

## 3. Environment variables by deployment

| Where | File/system | Holds |
|---|---|---|
| Backend dev | `api/.env` (gitignored) | `MONGODB_URL`, `SECRET_KEY`, Clerk keys, dirs |
| Backend prod | Render dashboard / VPS `api/.env` | same, prod values, `ENV=production` |
| Frontend dev | nothing needed | proxy does the work |
| Frontend APK/CI | `web/.env.production` (tracked — non-secrets only) + CI secrets | `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY` |

Rule: `.env` files never commit; the committed `.env.example` files document every variable. The startup validator refuses to boot in production without `SECRET_KEY` + Clerk keys — fail loud, not weird.

## 4. The build pipeline

```
web/                          api/
npm run build                 (no build; Python ships as source)
  tsc typecheck                    │
  vite build → dist/               │ uv sync installs deps
  PWA service worker injected      │
  verify-api-base guard ✔          │
       │                           │
       ▼                           ▼
Capacitor: npx cap sync        Docker image (api/Dockerfile)
android/ project updated       uvicorn app.main:socket_app :8000
npx cap build android          → behind nginx in compose stacks
→ app-release.apk              → Render reads render.yaml
```

The APK build is automated: push to `main` → `.github/workflows/build-apk.yml` → artifact with the debug/release APK. Release APKs are attached to GitHub releases; the update banner (see [06 §4](../06-backend/api-guide.md)) points users at `…/api/downloads/rheoson-latest.apk`, which nginx serves from disk.

## 5. CORS — who may call the API

The backend allowlists origins (`CORS_ORIGINS` env + builtins in `main.py`): the web SPAs, local dev ports, and `capacitor://localhost` (how the APK identifies itself). The Socket.IO server shares the list. When a new frontend host appears, it goes in **both** the env var and, if permanent, the builtins — otherwise the browser blocks every request (the failure looks like a network error, but the cause is policy, and the console says so explicitly).

## 6. Authentication infrastructure

Clerk issues sessions; the backend verifies them server-side (`api/app/core/auth.py`) using `CLERK_SECRET_KEY`. Webhooks (`/api/webhooks/clerk`) keep user records in sync, verified with `svix` against `CLERK_WEBHOOK_SECRET`. Keys are per-instance (test `pk_test_…` vs live `pk_live_…` — prefixes must match). Nothing else about auth is infrastructure-specific; the behavior matrix lives in [06 §5](../06-backend/api-guide.md).

## 7. External services inventory

| Service | Purpose | Config |
|---|---|---|
| YouTube Music (via ytmusicapi) | search, categories, metadata | none (unofficial API) |
| YouTube CDN | audio bytes (stream relay + downloads) | none |
| MongoDB Atlas | accounts, history, analytics | `MONGODB_URL` |
| Clerk | auth | `CLERK_*` keys |
| Render | cloud hosting | `render.yaml`, dashboard envs |
| GitHub Actions | APK CI | `.github/workflows/build-apk.yml` |

## 8. Production vs development — the honest table

| Concern | Dev | Prod |
|---|---|---|
| API URL | proxy | absolute (baked at build) |
| Service worker | **off** (HMR conflicts) | on (offline audio) |
| Music dir | your device | `MUSIC_DIR` env (ephemeral on Render!) |
| Logs | terminal, verbose | structured JSON, sampled |
| Clerk | test keys | live keys |

The Render free tier's ephemeral disk means downloads vanish on redeploys — that's a platform constraint, not a bug, and it's why the VPS compose file exists.

## Exercises

1. `npm run verify` in `web/` and read what it checks. Break it deliberately (empty `VITE_API_URL` in a scratch `.env.production`) and read the failure. Revert.
2. Find the three cron jobs in `api/app/main.py`. Which one exists because *YouTube changes* rather than *the app changes*?
3. Draw the request path for a guest streaming a song from the APK on mobile data. Every hop, including caches. Compare with the diagram in [05 §6](../05-codebase/architecture.md).
4. Why does `render.yaml` (and every compose file) set the uvicorn target to `socket_app`? What breaks otherwise?
