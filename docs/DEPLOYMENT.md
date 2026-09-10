# Rheoson — Deployment Guide

Four supported targets. Pick one; all run the same image/code.

> **Golden rule:** the uvicorn entry point is always `app.main:socket_app` — never `app.main:app`. The plain app object skips the Socket.IO ASGI wrapper and silently kills download progress and playback sync.

---

## 1. Render (managed, free tier)

`render.yaml` at the repo root declares both services; "New → Blueprint" deploys it directly.

**API (Python web service)**

| Setting | Value |
|---------|-------|
| Build | `pip install -e .` |
| Start | `uvicorn app.main:socket_app --host 0.0.0.0 --port $PORT --workers 1 --log-level info` |
| Health check | `/api/health` |

Required env vars (set in the dashboard, never committed):

```
SECRET_KEY              long random string (startup fails without it in prod)
CLERK_SECRET_KEY        sk_test_… / sk_live_…
CLERK_PUBLISHABLE_KEY   pk_test_… / pk_live_…
CLERK_WEBHOOK_SECRET    whsec_… (if webhooks are used)
SPOTIFY_CLIENT_ID       optional
SPOTIFY_CLIENT_SECRET   optional
```

Pre-configured in `render.yaml`: `ENV=production`, `MUSIC_DIR=/tmp/Rheoson/music`, `DOWNLOADS_DIR=/tmp/Rheoson/downloads`, restricted `CORS_ORIGINS`.

**Frontend (static site)**

| Setting | Value |
|---------|-------|
| Build | `npm install && npx vite build` |
| Publish dir | `web/dist` |
| Env | `VITE_API_URL=https://<your-api>.onrender.com` |

**Free-tier behavior:** the instance sleeps after ~15 idle minutes (≈30–50 s cold start). The API's built-in keep-alive pinger (`RENDER_API_URL` env or the default canonical host) hits `/api/health` every 14 minutes to mitigate this. `/tmp` storage does **not** persist across deploys/restarts — library files vanish on redeploys. Use disk-backed deployments (Docker/Termux) for a durable library.

**Webhooks:** point Clerk at `https://<your-api>.onrender.com/api/webhooks/clerk` and set `CLERK_WEBHOOK_SECRET`.

---

## 2. Docker / Docker Compose (self-hosted server)

Development (hot reload, source mounted):

```bash
docker compose up --build
# api → :8000, web (vite dev) → :3000, logs: docker compose logs -f
```

Production:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Both files mount `./music` and `./downloads` from the host, so the library survives container restarts — unlike Render's `/tmp`. Nginx (optional, `nginx/`): TLS termination + reverse proxy for `api` and the static frontend in one place; `docker-compose.prod.yml` wires it up.

Container healthchecks hit `/api/health` with retries; an unhealthy API is restarted by the orchestrator.

---

## 3. Termux / Android (bare metal)

The original target: the whole stack on a phone.

```bash
pkg install ffmpeg python nodejs mongodb
git clone https://github.com/picklem0b/Rheoson && cd Rheoson

# Backend
cd api && python -m venv .venv && source .venv/bin/activate
pip install -e .            # add --break-system-packages if pip refuses
cp .env.example .env        # MUSIC_DIR defaults to ~/Rheoson/music
uvicorn app.main:socket_app --host 0.0.0.0 --port 8000

# Frontend (second session)
cd web && npm install && npm run dev     # serves on :3000, proxies /api
```

The APK talks to the phone's local backend directly: `CapacitorHttp` bypasses WebView CORS, and dev builds can target the Vite dev server via `RHEOSON_DEV_URL=http://<lan-ip>:3000 npx cap run android`.

`api/app/cli.py` provides a `rheoson` entry point (`rheoson run`, doctor/scan helpers) for the same environment.

---

## 4. GitHub Pages (docs site only)

`docs/` is a Jekyll site deployed by `.github/workflows/deploy-pages.yml` on changes to `docs/**` or `README.md`. The web app itself is **not** hosted on Pages (SPA + service worker needs proper headers/HTTPS origin).

---

## Android APK builds

Local:

```bash
cd web
# set VITE_API_URL in web/.env.production first
npm run build:apk
# → web/android/app/build/outputs/apk/debug/app-debug.apk
```

CI (`.github/workflows/build-apk.yml`): on every push to `main` — Node 24 + `npm ci`, Vite build with `NODE_ENV=production`, `cap sync android`, Java 21 + Android SDK 35, `gradlew assembleDebug`, artifact upload (30-day retention). The JS inside is production-optimized even though the APK variant is debug (no keystore required).

Release/signed builds: supply your own keystore and add `assembleRelease` + signing config under `web/android/app/`.

Environment separation recap:

| Context | `VITE_API_URL` | Resulting API base |
|---------|----------------|--------------------|
| `npm run dev` | unset | `/api` via Vite proxy → `127.0.0.1:8000` |
| Web prod (Render) | set in dashboard | `<origin>/api` |
| APK | set in `web/.env.production` | `<origin>/api` baked into the bundle |

`VITE_CLERK_PUBLISHABLE_KEY` must be present at build time for auth to be enabled; without it the app runs in local no-Clerk mode (and the backend, in production, would 401 everything — so set both).

---

## Health & operations

| Probe | Use for |
|-------|---------|
| `GET /health/live` | Process-up liveness (zero I/O) — orchestrator restart signal |
| `GET /health/ready` | Readiness (storage + config) — traffic gating |
| `GET /api/health` | Full snapshot: version, uptime, memory, subsystem flags, cron schedule, keep-alive stats |
| `GET /api/health/diag` (auth) | Deep diagnostics: DB ping latency, yt-dlp/ffmpeg versions, config validation, recent 5xx |

Ops notes:

- **Backups:** copy `MUSIC_DIR` (library + per-user JSON stores) and the MongoDB dump (`mongodump`) — that is the whole system state.
- **Logs:** structlog JSON on stdout; every request carries an `X-Request-ID`. Ship stdout to your log pipeline.
- **Updates:** `git pull`, rebuild, restart. The daily yt-dlp self-update cron keeps extraction current between app updates; pin `yt-dlp` in `pyproject.toml` if you prefer controlled upgrades.
- **Secrets rotation:** rotate `SECRET_KEY` (invalidates internal signatures), Clerk keys, and the webhook secret independently; webhook rotation is zero-downtime (Svix allows overlapping secrets).

## Post-deploy checklist

1. `GET /api/health` → `200`, `services.clerk: true`, `services.mongodb: true`
2. Sign in through the app → `GET /api/auth/me` returns your user
3. Search a track → play it → confirm audio within a few seconds
4. Start a download → progress moves → file lands in `MUSIC_DIR/<Artist>/`
5. Open Downloads/Library → track appears without restart
6. From a second device: playback state follows the account
7. Clerk dashboard → webhook deliveries show `200`
