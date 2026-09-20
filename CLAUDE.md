# CLAUDE.md — Rheoson Codebase Context

> Version: 2.19.13 · Long-form docs: [docs/README.md](docs/README.md) · Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md) · Release process: [GIT_WORKFLOW.md](GIT_WORKFLOW.md)

Rheoson is a self-hosted music streaming + download app (Termux/Android APK first, Render cloud second). FastAPI + Socket.IO backend, React 18 + Vite + Capacitor frontend, MongoDB (Motor) for accounts/recommendations/analytics, JSON/SQLite sidecars for library state.

## Version sync (all 5, always together)

- `api/pyproject.toml` → `version = "2.19.13"` (then run `uv lock` — `uv.lock` carries it too)
- `web/package.json` → `"version": "2.19.13"`
- `web/src/lib/constants.ts` → `APP_VERSION = "2.19.13"`
- `api/app/main.py` → `VERSION = "2.19.13"`

## Non-negotiables

- **uvicorn target is `app.main:socket_app`, never `app`** — bypassing the Socket.IO ASGI wrapper kills every WS event (render.yaml and docker-compose both do this right).
- **`_file_id()` in `metadata_service.py`** (`MD5(str(path))[:16]`) is the local-track identity contract. Changing it breaks every stored URL.
- **Track router order**: static routes (`/liked`, `/liked/count`, `/recently-played`, `/trending`) must register before `/{track_id}`.
- **Cache invalidation chain**: a completed download must call both `invalidate_stream_cache()` (stream router) and `invalidate_track_index()` (track router), or new files stay invisible until restart.
- **Never reference the AI agent** in commits, docs, tags, or code comments. Commit style: conventional, imperative, no footers (see `git log`).

## Backend layout (api/)

- `app/main.py` — FastAPI + `socketio.ASGIApp`, routers under `/api/*`, cron jobs (library scan 30 min, yt-dlp update daily, job cleanup 6 h).
- `app/core/config.py` — pydantic-settings; `MUSIC_DIR`, `EXTRA_MUSIC_DIRS`, Clerk keys, `MONGODB_URL`, rate limits. `all_music_dirs` returns only dirs that exist.
- `app/core/toolchain.py` — the single source of truth for locating `yt-dlp` and `ffmpeg` (env override → `PATH` → Termux `$PREFIX/bin` → system dirs). Callers must go through it rather than spawning `"yt-dlp"` directly: without `ffmpeg`, downloads fall back to a raw audio-only container and streaming relays the untranscoded stream instead of failing.
- `app/core/auth.py` + `deps.py` — Clerk JWT verification (`get_current_user`); every data route requires a session (guest mode removed). There is **no** server-side login/register proxy: Clerk's Backend API mints a session from a user id without checking a password, so such a route is an account-takeover primitive. Sign-in lives in Clerk's hosted components. Issuer matching is host-exact (`_issuer_allowed`); `CLERK_ISSUER` pins a custom domain.
- `ENV` fails closed: only `development`/`dev`/`local`/`test`/`testing` select the development posture — anything else, including a typo, is treated as deployed. Add new development aliases to `Settings._DEV_ENVS`.
- Download jobs carry an `owner` (the Clerk `sub`) and every list/get/cancel/retry/delete filters on it. Jobs with no owner stay accessible on purpose (pre-upgrade transfers must not be stranded).
- `app/services/` — the meat:
  - `download_service.py` — job lifecycle, semaphore concurrency, persisted `.download_jobs.json`, yt-dlp progress regex (speed + ETA surfaced to WS). **Resumable**: failed/cancelled/restart-interrupted jobs keep their yt-dlp `.part` staging data; `resumable`/`stagedBytes` are derived from disk at read time (`_with_resume_fields`), `retry_job(resume=None|True|False)` controls continuation, and DELETE keeps staging for running jobs.
  - `stream_router.py` — two-tier serving: local file cache (MD5 ids, range support) → remote fast path (resolve-then-tee, ~sub-second start) with a disk-backed remote segment cache.
  - `track_identity.py` — SQLite sidecar `videoId → downloaded file`; makes `isDownloaded` trustworthy.
  - `preferences.py` — per-user synced settings whitelist (type + range validated, stored on the Mongo user doc).
  - `backup_service.py` — export/restore of liked, history, playlists, follows per user.
  - `artist_follows.py`, `local_history.py` — per-user JSON stores in `MUSIC_DIR` (`.following-*.json`, `.history-*.json`, …).
  - `weekly_cache.py` — ISO-week-bucketed JSON cache behind trending top-3 and category top-5.
  - `smart_search.py` — natural-language intent → "answers" over current playback/library context.
- `app/routers/` — thin handlers; `auth_router.py` also exposes `GET/PUT /auth/me/preferences` (+ `/defaults`), `artist_router.py` the follow endpoints.

## Frontend layout (web/src/)

- **Two-shell layout** — `hooks/useDeviceClass.ts` classifies the device from pointer modality + viewport width (+ Capacitor native override, `display-mode: standalone`); `RootLayout` renders the desktop sidebar or the mobile bottom nav from it. The APK always renders the mobile shell, even on tablets. Design tokens live in `index.css` (primitive → semantic → component layers); status colors are semantic tokens (`--danger`, `--success`, `--warning` families) — never raw Tailwind palette colors.
- **Stores** (`store/`, Zustand): `player`, `queue`, `auth` (persisted token; `ready` flips after session validation), `ui` (nav style/position/font), `theme`, `download`. Read them, don't mirror them into component state.
- **Query keys** live in `lib/queryKeys.ts` — never write a key inline. `lib/queryInvalidation.ts` refreshes whole surfaces (likes, playlists, history, follows) so a mutation reaches every mounted consumer without a reload; invalidating one ad-hoc key is how a like count went stale on the profile.
- **`lib/querySnapshot.ts`** keeps a whitelisted localStorage snapshot of small account summaries for instant first paint. Per-account, wiped on sign-out, 24 h ceiling, always revalidated. Adding a key to `SNAPSHOT_KEYS` means it must be small and safe to leave on the device.
- **Audio chain**: `hooks/player.hook.ts` (Howler singleton, `html5: true`, local-cache-first loading) → `lib/audioCache.ts` (IndexedDB byte cache) → `lib/audioEffects.ts` (shared Web Audio graph: EQ, bass boost, mono, pre-amp, normalisation — reads `rheoson-*` keys via `applyFromStorage()`).
- **`hooks/preferenceSync.hook.ts`** — server wins on sign-in, local edits mirror up while signed in. Whitelist lives server-side (`services/preferences.py DEFAULTS`).
- **`lib/prefetch.ts` + `hooks/prefetchIntent.hook.ts`** — stream warming: search results, visible rows, and upcoming queue tracks buffer before play.
- **Settings** (`pages/settings/`): sections are honest — every toggle there has a live consumer. Don't add a control without wiring it; delete controls rather than leaving them decorative. `DiagnosticsSection` = Doctor (health probes → plain-language repairs).
- **Player**: `PlayerBar` overflow menu → "Playback settings" opens `PlaybackSettings` (EQ + Sleep Timer) mounted once in `RootLayout`, listening for `rheoson:playback-settings`.
- **NowPlaying**: Creator tab = Spotify-style artist header + lyrics only. Tap-to-seek uses lyric `startTime`.
- **Downloads on Android**: `lib/downloadForeground.ts` → `DownloadForegroundPlugin` (registered explicitly in `MainActivity`) → `DownloadForegroundService` (foreground slot + persistent notification) keeps the process alive while jobs run. The hook starts it when `activeJobs` grows and stops it at zero. No-op on web.
- **Types**: `types/openapi.json` is generated (`npm run generate:types`, exporter is deterministic — don't hand-edit either).

## Testing & verification (run before every commit)

```
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build
cd api && uv run python -m pytest -q
```

Current baseline: 109 frontend + 281 backend tests, lint/tsc/pyflakes clean. Backend tests patch `app.core.database.get_db` as a FastAPI dependency; a mock-DB round trip in a test means the fixture resets `_shared_mock_db` state (see `tests/conftest.py::_clean_state`).

## Data map

| Data | Where |
| --- | --- |
| Music files | `MUSIC_DIR/<Artist>/<Title>.<ext>` |
| Liked / history / playlists / follows / hidden | per-user JSON sidecars in `MUSIC_DIR` (`.liked-*.json` …) |
| videoId → file map | `.track_map.sqlite` (track_identity) |
| Download jobs | `.download_jobs.json` |
| Weekly trending/category picks | `weekly_cache` JSON in `MUSIC_DIR` |
| Accounts, prefs, signals, analytics | MongoDB (`users`, `user_signals`, `taste_profiles`, …) |
| Client audio cache | IndexedDB via `lib/audioCache.ts` |

## Known constraints

- Render free tier: ephemeral disk → streaming-only there; downloads and JSON sidecars are Termux features. Backup/restore exists because of this.
- yt-dlp breaks regularly; keep the daily update cron and the Doctor's "update yt-dlp" repair.
- A downloaded track keeps its videoId identity after download (track_identity resolves it) — don't reintroduce MD5-vs-videoId dual lists on the frontend; key on `normalize.ts` output.
- `.gitignore` anchors: `downloads/` (unanchored) once shadowed `web/src/pages/downloads/` — keep path-specific patterns anchored.
- Termux: after `npm ci`/git operations, Vite may fail with `Cannot find module @rollup/rollup-android-arm64` (npm/cli#4828 drops platform-optional deps). Fix: `npm install` once (never delete package-lock.json — the lockfile is correct and contains all platform binaries), then re-verify with `npm ci`-compatible state. Also: `npm run dev -- host 0.0.0.0` is wrong — `--host` takes no value (vite.config.ts already sets `host: true`); passing `host` as a value causes `ENOTFOUND host`.
- Termux: `uv run uvicorn …` failing with `Failed to spawn … No such file or directory` (or `uv run python` falling through to system python) means the `.venv` is stale/partial. Fix: `cd api && uv sync --extra dev`; smoke-boot with `.venv/bin/python -m uvicorn app.main:socket_app --host 127.0.0.1 --port 8000`.
- `reference/` (design screenshots) and `notes.txt` are local-only, never commit them.
