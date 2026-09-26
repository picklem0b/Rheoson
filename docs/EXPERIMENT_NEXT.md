# Rheoson Next — the experiment plan

> Branch: `experiment/nextjs` · Status: **PLANNING** (no code yet) · The working app on `dev` is untouched and stays shippable at all times.

The migration: React → Next.js (full website + PWA, no APK), Python → TypeScript core with Python kept only as a slim engine. Promoted to `main` only when the clone beats the original.

## The shape

```
Rheoson/
├── apps/
│   ├── client/        Next.js FULL WEBSITE + PWA (installable, no APK)
│   ├── server/        Node/TS: API core, Clerk auth, Postgres/Drizzle
│   └── services/
│       ├── go/        STREAM RELAY — bytes, range, cache-tee (agent-written, Phase 1)
│       ├── py/        yt-dlp · ffmpeg · mutagen tagging · .part resume
│       ├── node/      realtime gateway (WS/SSE) + BullMQ workers
│       ├── search/    Meilisearch (Rust, off-the-shelf — configure, don't write)
│       └── analyze/   (later phase) Java: EBU R128 loudness, waveforms, fingerprints
├── packages/shared/   DCCNN codes + track types + service contracts — one source of truth
└── infra/             docker-compose: redis · postgres · meilisearch · caddy
```

## Service map — every language does only what it's elite at

| Service | Stack | Its one job |
| --- | --- | --- |
| client | Next.js + PWA | the entire face; installable via home screen, offline shell, Media Session |
| server | Node/TS + Postgres (Drizzle) | accounts, auth glue, playlists, prefs, history — the JSON brain |
| services/go | Go | byte relay: range, cache-tee, upstream-death handling — the hot path |
| services/py | Python | the muscles only Python has: yt-dlp, ffmpeg, mutagen |
| services/node | Node | live events + queue workers (download progress, job state) |
| services/search | Meilisearch | typo-tolerant instant search |
| services/analyze | Java (later) | loudness normalisation, waveforms, fingerprints |
| infra | Redis · Caddy | Redis: cache/queue/rate-limit/pubsub. Caddy (Go): edge TLS, headers, first line of defense |

## Talking rules (the contract)

1. **client → server only.** The browser never touches a service directly; server proxies/gateways.
2. **server ⇄ services**: plain HTTP/JSON + Redis pub/sub for events. One bus, no spaghetti.
3. **Every service is optional.** Go relay down → server serves bytes itself. Search down → server's own index. Degrade gracefully; six runtimes must never mean six single points of failure.
4. **`packages/shared`** defines every contract (DCCNN codes, track types, endpoints). Client and server both import it; drift is impossible.

## Sacred (non-negotiable, carried from CLAUDE.md)

- `_file_id()` MD5 identity + `.track_map.sqlite` — downloaded files keep their identity.
- yt-dlp `.part` resume semantics — ported, not reinvented.
- DCCNN error codes + `[ERROR_CODE: DCCNN]` chips — becomes the shared package.
- Clerk — same accounts, no migration.
- ENV fails closed; owner-scoped download jobs; the cache-invalidation chain (stream + track index).

## Decisions (locked with the user)

| Decision | Choice |
| --- | --- |
| TS backend location | All inside Next.js route handlers (same `/api/*` paths) |
| Database | Postgres + Drizzle (accounts may stay in Mongo initially) |
| Python carve | Slim engine only: yt-dlp, ffmpeg, tagging, resume |
| First demo | Music playing (browse → play → hear audio fastest) |
| PHP | Skipped — no natural slot |
| Java analyze | Reserved slot, later phase |
| APK | Replaced by PWA (Media Session, offline shell, install prompt) |
| Go relay | **Agent writes the Go relay in Phase 1**; user reviews. Contract below.

## Deployment posture (locked)

Termux is no longer a design constraint. The experiment targets:

- **Dev/prod parity via Docker** — `infra/docker-compose.yml` runs postgres, redis, meilisearch, caddy; services and apps get their own compose blocks.
- **CI via GitHub Actions** — build/test matrix across Node, Go, and Python; container images published on main.
- **Scale path** — any Docker host (VPS, Fly.io, Railway, or bigger) with zero code changes; the services-optional design is retained for *resilience*, not device limits.

## Phases — each ends with something visible

| # | Phase | Done when |
| --- | --- | --- |
| 0 | Skeleton: monorepo, Next boots with Rheoson design tokens, error-page system ported | the new app opens and looks like Rheoson |
| 1 | Play: stream/artwork/search/lyrics through go-relay + server; py-engine carved | pressing play produces sound |
| 2 | Sign in: Clerk + Postgres accounts, prefs, history, playlists | likes and settings follow you in |
| 3 | Download: BullMQ + node workers, SSE progress, resume intact, shared DCCNN codes | live progress + red fail toast with a code |
| 4 | The verdict: Redis everywhere, parity checklist, side-by-side run | decide: promote or archive |

## Integration contract for services/go (what the Go must expose)

- `GET /relay/audio?track={id}&range=…` → streams CDN bytes with Range support, mirrors Content-Length/Content-Range, tees whole-file responses to the cache dir, and **never raises on upstream death** — it ends the response and reports `{relayed, expected, error}` via `X-Relay-Status` header or a one-line JSON log.
- `GET /relay/health` → liveness for the fallback check.
- Config by env: `RELAY_PORT`, `CACHE_DIR`, `UPSTREAM_RESOLVER` (points at server or py-engine).
- server treats it as optional: probe `/relay/health`, fall back to Node byte-serving when absent.
