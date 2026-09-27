# Phase 3 — System specification

> Phase 3 of 8 · Owner: Solar Mini/Pro 4 session (drafted here, to be challenged there)
> Inputs: `01-discovery.md`, `02-architecture.md`, the shipped code on
> `experiment/nextjs`, and the tags `next-v0.1.0` … `next-v0.11.0`.
> Every statement below describes something that exists and is verified by a
> test or a gate in `06-test-report.md`; anything aspirational is labelled.

## 1. What Rheoson Next is

A self-hosted music server with three faces over one library:

| Face | Stack | Ships when |
| --- | --- | --- |
| Website (installable PWA) | Next.js 16 App Router, React 19, Tailwind 4 | `apps/client` |
| Desktop | the same client wrapped in Tauri | **not built** — see §9 |
| Mobile | the same client as an installed PWA | `apps/client` |

It streams from YouTube's CDN, downloads with `yt-dlp` + `ffmpeg`, keeps a real
local library with stable track identity, and reports every failure with a code
that resolves to exactly one place in the source.

## 2. Runtime topology

```
                    ┌──────────────────────────┐
   browser/PWA ─────▶│ apps/client  (Next.js)   │  :3000
   (one origin)      └────────────┬─────────────┘
                                  │  /api/*   (session, CORS, rate limits)
                    ┌─────────────▼────────────┐
                    │ apps/server (Fastify)    │  :4000   ← the only public API
                    │  accounts · prefs ·      │
                    │  playlists · jobs · SSE  │
                    └───┬──────────────┬───────┘
        service token   │              │ service token
             ┌──────────▼───┐   ┌──────▼────────────┐
             │ relay (Go)   │   │ engine (Python)   │  :8081
             │ :8080 bytes  │──▶│ yt-dlp · ffmpeg   │
             │ range · tee  │   │ library · jobs    │
             └──────────────┘   └───────────────────┘
             ┌──────────────┐
             │ Postgres     │  accounts, prefs, playlists, likes, history
             └──────────────┘
             ┌──────────────┐
             │ Redis        │  reserved: bus + rate-limit store at scale
             └──────────────┘
```

**Three rules, enforced by the layout rather than by convention:**

1. **The browser talks only to `apps/server`.** The services are on an internal
   network; the client never names a service, a host or a byte URL it did not
   receive from the API.
2. **The server ⇄ services protocol is HTTP + JSON + one event callback.** No
   service reads another service's database.
3. **Every service is optional.** With the relay down, the server serves bytes
   itself; with the engine down, playback of downloaded tracks still works and
   downloads fail with `DEN02`; with Postgres down, reads degrade and writes
   report `EEN01`/`LEN01`. Six runtimes never mean six single points of failure.

## 3. Data ownership

| Data | Owner | Store | Why there |
| --- | --- | --- | --- |
| Music files, `.staging`, `.download_jobs.json` | engine | its data dir | only Python has the tools |
| `videoId → file` identity (`.track_map.sqlite`) | engine | its data dir | written at download time; identity is a file fact |
| Library listing (tags, artists, albums) | engine | derived from disk, cached 20 s | reading tags is Python's job |
| Accounts, prefs, likes, history, follows, playlists, blends, messages | server | Postgres | relational, multi-user, transactional |
| Byte cache (whole-file tees) | relay | its cache dir | the hot path owns its own cache |
| Client audio cache | browser | IndexedDB | per-device, disposable |

**Resolution precedence for playback:** local file (`/local/{id}`, range
support, no network) → relay (resolved CDN URL, tee) → server direct (resolved
CDN URL, no cache). The tier that served a response is reported in
`X-Rheoson-Source`, so "why was that slow?" is a header away.

## 4. Contracts

### 4.1 Error codes (DCCNN)

`D`omain `CC`ategory `NN`umber — e.g. `DEX01` = downloads / execution / 01.
Registry: `packages/shared/src/error-codes.ts`, 122 codes, exported to
`packages/shared/generated/error-codes.json` for the Python engine. Wire format
everywhere: `Human copy [ERROR_CODE: DEX01]`.

Uniqueness, section non-overlap and the wire format are pinned by
`packages/shared/tests/error-codes.test.ts`; drift between the TypeScript
registry and the committed JSON export fails CI.

### 4.2 API surface (all session-authenticated)

```
GET    /health                              unauthenticated liveness
GET    /api/me                              profile (created on demand)
GET    /api/me/preferences                  merged with defaults
PUT    /api/me/preferences                  whitelisted, type- and range-checked
GET    /api/me/preferences/defaults
GET    /api/me/likes            POST /api/me/likes            {trackId}
DELETE /api/me/likes/:trackId   GET  /api/me/likes/count
GET    /api/me/history          POST /api/me/history          {trackId, secondsPlayed?}
DELETE /api/me/history          GET  /api/me/history/top
GET    /api/me/follows          POST /api/me/follows          {artistId}
DELETE /api/me/follows/:artistId
GET    /api/library/tracks|artists|albums
GET    /api/search?q=&remote=
GET    /api/lyrics?title=&artist=&album=&duration=
GET    /api/playlists           POST /api/playlists
GET    /api/playlists/:id       PATCH /api/playlists/:id      DELETE /api/playlists/:id
POST   /api/playlists/:id/tracks
DELETE /api/playlists/:id/tracks/:trackId
PUT    /api/playlists/:id/reorder
GET    /api/tracks/:id/stream   GET /api/tracks/:id/info      GET /api/tracks/:id/artwork
GET    /api/downloads           POST /api/downloads
GET    /api/downloads/:id       DELETE /api/downloads/:id
POST   /api/downloads/:id/cancel        POST /api/downloads/:id/retry
POST   /api/messages/*  /api/realtime (SSE)   /internal/events (engine → server)
```

**Routing rule (a non-negotiable carried from the current stack):** static
segments register before parameters — `/api/me/likes/count` before
`/api/me/likes/:trackId`, `/api/downloads/rescan` alongside
`/api/downloads/:jobId`. Registration order in `main.ts` is a contract, not a
style choice.

### 4.3 Download job

```
{ id, owner, target, trackId|null, url|null,
  status: queued|running|completed|failed|cancelled,
  progress: 0..100, speed: bytes/s|null, eta: seconds|null,
  totalBytes|null, downloadedBytes, title, artist, album, filename,
  error|null, errorCode|null, attempts,
  resumable: bool, stagedBytes, active: bool,
  createdAt, updatedAt }
```

`resumable` and `stagedBytes` are **derived from disk at read time**. A stored
flag can disagree with the filesystem after a crash, and a UI offering "resume"
for bytes that are gone is worse than one offering nothing.

`owner` comes from the verified session and is attached by the server; the
client never names an owner. Jobs with no owner stay visible on purpose — a
pre-upgrade job must not become unreachable.

## 5. Decisions (ADRs)

| # | Decision | Rationale | Status |
| --- | --- | --- | --- |
| 1 | Separate `apps/server` in Node/TS; Next API routes only for client-local needs | keeps one public API and one auth mechanism | shipped |
| 2 | Postgres + Drizzle | relational social data, real transactions, reviewable SQL migrations | shipped |
| 3 | Python kept as a slim engine (yt-dlp, ffmpeg, tagging, resume) | those tools are the reason Python stays; nothing else is | shipped |
| 4 | Go relay for bytes | range arithmetic at the edge of the network, zero third-party Go deps | shipped |
| 5 | `packages/shared` owns codes, types, validation | one registry, two languages, drift impossible | shipped |
| 6 | SSE for realtime (server-owned bus) | one connection per client, works over plain HTTP, reconnects | shipped |
| 7 | Separate mobile and desktop experiences | the input model differs; a single layout serves neither | desktop deferred |
| 8 | **Queue lives in the engine, not in a Node worker pool** | the work can only run in Python; a Node worker would exist only to ask Python to do it, adding a hop, a queue, and a second place job state can live | amended |
| 9 | **Redis is deferred to the scale path** | one server process has no fan-out problem to solve; Redis is in compose and documented, and nothing reads it yet | amended |
| 10 | **Clerk wired server-side; the client's session is an interface with a dev provider** | the server verifies Clerk JWTs today; the client needs a publishable key to add its provider, and the app must boot without keys | amended |

ADR-8/9/10 are the honest record of where the plan met reality. Each is a
narrowing, not a shortcut: nothing in the deferred work is required for the
parity checklist in `04-plan.md`.

## 6. Non-negotiables that survived the rewrite

| Rule | Where it lives now | Test |
| --- | --- | --- |
| `_file_id()` = `MD5(str(path))[:16]` | `services/metadata.py::file_id` | `test_library.py::test_file_id_is_stable_and_path_derived` |
| A downloaded track keeps its videoId | `identity.py` | `test_identity.py`, `test_library.py::test_a_mapped_file_reports_its_video_id` |
| `.part` resume survives failure | `downloads.py` staging | `test_downloads.py::test_retry_resumes_from_the_staged_bytes_instead_of_restarting` |
| DCCNN codes on every failure | `packages/shared` | registry tests + every route test |
| ENV fails closed | `env.ts`, `settings.py` | `env.ts` exits on a missing `DATABASE_URL` |
| Owner-scoped jobs | engine + server + service | `test_downloads.py::test_owner_scoping…`, `tests/downloads.test.ts` |
| Cache invalidation after a download | engine `library.invalidate()` + `library:changed` event | `test_downloads.py::test_a_successful_download_lands_in_the_library…` |
| Empty ≠ skeleton | `components/ui/States.tsx` | client tests + review finding F3 |

## 7. Module conventions

* **TypeScript:** ESM, `.js` import specifiers in `apps/server`, `#path`-style
  aliases only inside the client (`@/…`). Every module opens with a docblock
  that states *why* the module exists and what a caller must know.
* **Python:** `from __future__ import annotations`, module docstrings in the
  same style, no comments restating code.
* **Go:** package doc comments; `gofmt`-clean is a CI gate.
* **Tests:** one suite mirroring the module's name; a test that cannot fail for
  a real reason is deleted rather than kept.
* **Errors:** a failure raises/throws a coded error at exactly one place; the
  route layer translates it; the client renders it.

## 8. Operational runbooks

**Boot (dev).** `docker compose -f infra/compose.yml up --build` → Postgres,
Redis, Meilisearch, engine, relay, server, client. Then
`pnpm --filter @rheoson/server db:migrate` once.

**Boot (bare metal).** `pnpm install`; `pnpm --filter @rheoson/server db:migrate`;
`pnpm exec turbo run dev`; start the Go relay with
`UPSTREAM_RESOLVER=http://localhost:8081`; start the engine with
`uv run python -m app.main`.

**Doctor.** `GET /health` on the engine reports tool availability
(`yt-dlp`, `ffmpeg`), library counts, identity-mapped tracks and active jobs.
`GET /health` on the server is liveness only — deliberately silent about
internals.

**Repair: yt-dlp aged out.** The engine's toolchain resolves `yt-dlp` by env
override → `PATH` → known directories, and upgrades a pip-installed binary
through the interpreter that installed it (`-U` refuses for pip installs). The
client's failure toast carries `DEX01` plus the tool's own message.

**Repair: ffmpeg missing.** Downloads degrade to a raw audio container
(`DEN03` when conversion is explicitly requested); streaming is unaffected.

**Restore from backup.** `web/` + `api/` still run on `main` (v2.22.1), so a
rollback is a deploy, not a data migration.

## 9. Deliberately not built

| Thing | Why | What it would take |
| --- | --- | --- |
| `apps/desktop` (Tauri) | the client's native bridges sit behind `isNativePlatform()`; desktop is a third adapter, and the web app is the priority-1 target | wrap `apps/client`, implement the capability adapter, ship installers |
| `apps/services/node` | ADR-8: SSE lives where auth lives; a queue exists only if a worker exists | a second Node process subscribing to Redis and re-verifying sessions |
| Redis-backed bus | ADR-9: one process has no fan-out problem | swap `realtime/bus.ts` internals; the publish/subscribe surface is the seam |
| Meilisearch ranking | `services/search/settings.json` is the config; the library half works without it | point the server's library search at Meili and index on download |
| Java analysis (EBU R128, waveforms) | nothing in the product needs it yet | a JVM service behind the same service-token contract |
| Telegram/backup tooling | the current stack's backup format is the migration input | port `backup_service.py` once parity is proven |
