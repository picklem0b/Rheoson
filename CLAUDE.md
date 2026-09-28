# CLAUDE.md — Rheoson (`experiment/nextjs`)

> The architectural rebuild. The shipping FastAPI/Vite app lives on `main`/`dev`; here the product is re-platformed: Next.js client, Fastify server, Go relay, Python engine, one shared error-code contract. Long-form: [docs/EXPERIMENT_NEXT.md](docs/EXPERIMENT_NEXT.md) · build log: [docs/migration/05-log.md](docs/migration/05-log.md) · sign-off: [docs/migration/08-signoff.md](docs/migration/08-signoff.md)

## Layout

```
apps/
  client/       Next.js 15 + React 19 — the only frontend (PWA, no APK)
  server/       Fastify 5 + TS — API core, Clerk auth, Postgres/Drizzle, pino
  services/
    go/         Stream relay — range requests, cache-tee, freshness retries
    py/         Engine — yt-dlp, ffmpeg, library scan, identity, search, Spotify matching
packages/
  shared/       DCCNN error-code registry — exported to JSON, imported by the engine
infra/          Dockerfiles + compose + Caddy for this stack
```

## Non-negotiables

- **The DCCNN registry is the contract.** Codes live once in `packages/shared/src/error-codes.ts`, are exported to `generated/error-codes.json`, and the Python engine imports that JSON. `pnpm --filter @rheoson/shared export:error-registry` then `git diff --exit-code` is a CI gate — never hand-edit the JSON.
- **Wire format is `[ERROR_CODE: <code>]`** appended to user-facing messages. Clients split on it; the code chip in a popup is the traceability promise. Never break the suffix format.
- **Identity is `videoId ↔ local file`** (`apps/services/py/app/services/identity.py`, SQLite `.spotify_map`-style sidecar in the data dir). `record()` is idempotent on video_id and unique on file_id. `mark_downloaded()` *annotates* track dicts — it records nothing.
- **No homemade password login.** The server has no register-with-password route (Clerk's backend API mints sessions without checking passwords — that route is an account-takeover primitive). Sign-in is Clerk's, or the dev posture: `X-Dev-User` against an allow-list, only when Clerk keys are absent. ENV fails closed.
- **Downloads/jobs are owner-scoped** (Clerk `sub`); ownerless records stay accessible so pre-upgrade transfers aren't stranded.
- **The relay must send a Range header upstream even for clients that don't** — some CDNs stall range-less requests. A full-span 206 is presented as 200; a capped 206 passes through. Resolution retries take a `fresh=1` hint — a cached refused URL is not a retry.
- **Popups are for genuine attention; toasts are quiet.** `toast.error` physically routes into the popup store — an error toast cannot exist. Popups carry the code chip + ⓘ detail. Nothing pops for play/like/pref-saves.
- **Every UI surface is replaceable through the slot registry** (`apps/client/src/store/ui.registry.ts`): call sites render `useUI('slot-name')`; swapping an owner is one `registerUI` line. Slots are named for purpose, not construction. Popup kinds likewise (`definePopupKind`) — `PopupHost` never names a kind.
- **Never reference the AI agent** in commits, docs, tags, or code comments. Commit style: conventional, imperative.

## Ports & running

| Surface | Port | Start |
|---|---|---|
| client | 3000 | `pnpm dev` (turbo: client + server) |
| server | 4000 | ↑ |
| engine | 8000 | `cd apps/services/py && uv run uvicorn app.main:app --port 8000` |
| relay | 8087 | `cd apps/services/go && go run ./cmd/relay` (env: `RELAY_PORT`, `CACHE_DIR`, `ENGINE_URL`) |
| ops console | /admin | client page over server `/api/ops/*` |

Dev identity: `X-Dev-User: dev_user_a` (allow-list in server env). Postgres via `DATABASE_URL`; server tests never open a connection (placeholder URL is honest).

## Testing & verification (before every commit)

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
cd apps/services/py && uv run python -m pytest -q && uv run pyflakes app tests
cd apps/services/go && go vet ./... && go test ./... && gofmt -l .
```

Baseline: engine 151, server 83, client 91, shared 14, relay 20 — green. Live suite (`RHEOSON_LIVE=1`) exercises real YouTube: resolution, relay bytes, a full download.

Test-isolation facts that bite: the engine's identity DB is session-shared (downloads tests *do* write real rows — control your own premise); server pino log ring is module state (`_reset_log_ring()` exists for tests); popup/registry stores need explicit resets between tests in one file.

## Milestones & tags

Every slice lands behind an annotated `next-vX.Y.Z` tag (format in `GIT_WORKFLOW.md`) — any point is a rollback target. `docs/migration/05-log.md` is the decision log; keep it current with each tag.

## Known constraints

- Render free tier's ephemeral disk makes it streaming-only; downloads want a real disk (VPS or local).
- yt-dlp breaks regularly; the engine's toolchain locator (env → PATH → Termux `$PREFIX/bin` → system dirs) is the only sanctioned way to spawn it.
- A matched Spotify track keeps its YouTube identity after download — key on the identity map, never on Spotify URIs, for on-disk facts.
- `web/` and `api/` are gone from this branch (they live in `main`/`dev` history). Workflows are path-scoped: `next-ci.yml` guards this branch; `ci.yml`/`build-apk.yml`/`deploy-pages.yml` guard main/dev only.
