# Chapter 18 — Infrastructure and Deployment

*Part IV · Engineering Practice*

---

One codebase, four ways to run: local development, a personal Termux device, a small VPS, and Render's free tier. This chapter covers what each environment is, how code reaches it, and how the pieces connect. The unifying idea: **environments differ only in configuration** — the same images, the same env-var contract, three hosting shapes.

## 18.1 The four environments

| Environment | What it is | Backend | Frontend | Data |
|---|---|---|---|---|
| **Local dev** | a laptop or Termux session | `uvicorn --reload` on `127.0.0.1:8000` | Vite dev server on `:3000`, proxying `/api` | local `mongod` (optional — file features work without it) |
| **Termux** | the app's first-class home: backend on the phone itself | on-device uvicorn, `127.0.0.1:8000` | bundled in the APK (`capacitor://localhost`) | on-disk `MUSIC_DIR`, optional local MongoDB |
| **VPS** | a small rented server (the durable-cloud choice) | Docker Compose behind Caddy (automatic HTTPS) | static build served by the same proxy | **persistent** — bind-mounted `./data/` survives redeploys |
| **Render free** | zero-cost cloud | container, `socket_app` | static site | ephemeral disk — downloads die on redeploy |

The Termux row explains the product: the phone runs its own backend at loopback, so playback works offline, downloads are permanent, and "self-hosted" is literal. The VPS row exists because Chapter 18.5's Render constraint (ephemeral disk) makes long-term cloud downloads impossible there; `docker-compose.vps.yml` + `Caddyfile` are the durable answer, with `./data/` bind mounts so a server migration is a directory copy.

## 18.2 The full picture

```
                    ┌───────────────────────────┐
                    │  Developer / contributor  │
                    └─────┬─────────────┬───────┘
                 git push │             │ git push
                          ▼             ▼
                 ┌────────────┐   ┌──────────────┐
                 │  GitHub    │   │   GitHub     │
                 │  main/dev  │   │  Actions     │
                 └─────┬──────┘   └──┬───────┬───┘
              release  │             │       └──► APK artifact
             tag+merge │             │ render.yaml autodeploy
                       ▼             ▼
              ┌─────────────┐   ┌──────────────────┐
              │ Cloudflare/ │   │  Render services │
              │ DNS         │   │  API + web       │
              └──────┬──────┘   └────────┬─────────┘
                     ▼                   ▼
          ┌──────────────────┐   ┌───────────────┐
          │  VPS (docker)    │   │ MongoDB Atlas │
          │  Caddy → api/web │   │ (accounts,    │
          │  ./data/ (music, │   │  signals)     │
          │  playlists, db)  │   └───────────────┘
          └──────────────────┘
                     ▲
                     │ HTTP + Socket.IO
          ┌──────────────────┐
          │ Android APK      │   loads the API by absolute URL
          │ (Capacitor)      │   (VITE_API_URL baked at build)
          └──────────────────┘
```

Every arrow is a chapter's subject: the APK-to-backend arrow is Chapter 12's origin story, the Render arrow is 18.4's CI, the `./data/` box is 18.3's durability argument.

## 18.3 The deploy targets

**Termux (the flagship).** From the repo: `uv sync` → `uv run uvicorn app.main:socket_app` — the process listens on loopback, the APK points at it. Music lands in `MUSIC_DIR` on device storage; nothing leaves the phone except YouTube traffic. Keeping the process alive is `termux-wake-lock` (13.7's note).

**VPS.** `cp api/.env.vps.example api/.env`, fill it, `bash scripts/vps-deploy.sh`. Compose brings up backend, proxy, and static web; Caddy terminates TLS and renews certificates itself. Everything durable — music, sidecars, the identity DB, MongoDB data if self-hosted — lives under `./data/` as bind mounts, so redeploys, upgrades, and even server moves preserve it (the property Render cannot offer, and the reason the VPS target exists).

**Render (free tier).** `render.yaml` declares the services; pushes to `main` auto-deploy. The constraint is architectural and stated rather than hidden: the disk is ephemeral, so `MUSIC_DIR=/tmp/Rheoson/music` means downloads and sidecars vanish on every redeploy. Render is therefore streaming-first; anything that must survive belongs on Termux or the VPS.

## 18.4 CI: GitHub Actions

`.github/workflows/build-apk.yml` runs on pushes to `main`: install Node, install dependencies from the lockfile, **build the web bundle with the verify gate** (12.4 — the build fails if the API origin is missing or relative), sync Capacitor, assemble a debug APK, and publish it as an artifact. The gate is the CI embodiment of the project's worst historical bug (the relative-URL build), which is why it runs even when secrets are absent — the fallback host is valid, and silence about which one was chosen is the bug the gate exists to prevent.

## 18.5 Environment and secrets, per target

The Chapter 3.7 contract, made operational per environment:

| Variable group | Local dev | VPS | Render |
|---|---|---|---|
| Backend (`MUSIC_DIR`, `ENV`, `SECRET_KEY`, Clerk keys, MongoDB URL) | `api/.env` (gitignored) | `api/.env` on the host (compose reads it) | Render dashboard |
| Frontend (`VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`) | usually unset — proxy covers it | build args via compose | dashboard or baked defaults |
| Origins (`CORS_ORIGINS`) | defaults cover `localhost` | every host Caddy serves | every Render domain + `capacitor://localhost` |

Templates (`api/.env.vps.example`, both `.env.example` files) document every key; one key per line is correctness, not style (the run-together paste that broke auth is Chapter 3.7's cautionary tale). **Secrets never enter Git** — a leaked credential is rotated, not deleted, because history preserves it. Production refuses to start without its required keys (Chapter 9's config layer enforces this), which turns a silent misconfiguration into a loud boot failure.

## 18.6 Production versus development, the real differences

Beyond config values, four behaviors differ deliberately:

1. **The service worker** is off in dev (it fights HMR) and on in prod (12.5's caching).
2. **The API base** is the dev proxy in dev, the absolute `VITE_API_URL` in prod — Chapter 3.8's "works in dev, not in prod" mechanism.
3. **Startup is strict** in prod: missing required keys stop the boot; dev starts degraded instead.
4. **Logging** is structured and quiet in prod; dev logs verbosely to the terminal.

Each difference is documented at its implementation site, and each has been a bug's root cause at least once — the list is worth rereading when something works locally and not in a deployment.

## 18.7 Operating a deployment

The operational loop for whoever runs the instance: check `/api/health` (version, dirs, cron state — the Doctor's backend half reads the same signals); watch for the three failure classes with known signatures — stale yt-dlp (9.8's cron is the countermeasure), cache staleness after manual file changes (the rescan endpoint), and MongoDB unavailability (file features keep working; DB routes 503 by design). Backups on any durable target are a copy of `MUSIC_DIR` plus a database dump; restore is copying both back — a deliberate simplicity Chapter 10's storage choices buy.

## Exercises

1. A contributor reports "downloads vanish after every deploy on Render." Which row of 18.1 explains it, and which target is the documented fix?
2. Trace one commit from `git push` to a device playing new code, naming every arrow it crosses in 18.2's diagram.
3. The APK CI goes green but the app on device still shows the old behavior. Using 12.4 and 18.4, list the two most likely causes in order.
4. Write the checklist for migrating a personal instance from Render to the VPS: what moves, what is re-created, what is regenerated.
5. Explain why `socket_app` appears in every deploy file (18.3) by referencing 9.1 — and what the user-visible symptom is when one file gets it wrong.
