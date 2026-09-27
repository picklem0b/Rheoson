# Rheoson Next — the experiment plan

> Branch: `experiment/nextjs` · Status: **PLANNING — approved, awaiting GO** (no code yet) · `web/` + `api/` stay running and shippable until the parity verdict.

The migration: React → Next.js (full website + PWA, no APK), Python core → TypeScript, Python kept only as a slim engine. Polyglot services, each doing only what it is elite at.

## The lifecycle of `web/` + `api/`

| Stage | What happens |
| --- | --- |
| 1. Keep | `web/` + `api/` stay exactly as they are — running, shippable, untouched |
| 2. Port | Every phase lifts *working* code from them into `apps/*` (port map below) |
| 3. Parity | Phase 4: side-by-side run against a checklist — play, downloads, resume, auth, prefs, errors, offline |
| 4. Remove | Checklist passed → `web/` + `api/` deleted; focus goes 100% to `apps/*`. Git history keeps every line |

## The port map — reuse, don't rewrite

| From | To |
| --- | --- |
| `web/src/components` (PlayerBar, error pages, toasts, settings primitives, DownloadModal) | `apps/client/src/components` |
| `web/src/lib` (audioCache, audioEffects, prefetch, queryKeys, keepAwake) + `hooks` + `store` | `apps/client/src/lib` · `hooks` · `store` |
| Design tokens (`index.css` primitive → semantic → component layers) | `apps/client/src/app/globals.css` |
| `api/app/core/error_codes.py` (DCCNN registry, `[ERROR_CODE: …]` wire format) | `packages/shared/src/error-codes` |
| `download_service` (semaphore, `.part` resume, progress regex), `track_identity` sqlite, mutagen tagging | `apps/services/py` |
| Relay cache-tee / range / upstream-death semantics (as fixed in v2.21.4) | `apps/services/go` |
| Clerk config, preferences whitelist, backup format | `apps/server/src/auth` · `services` |

## The shape

```
apps/client      Next.js full website + PWA — the entire face, no APK
apps/server      Node/TS brain — API, Clerk auth, Postgres + Drizzle
apps/services    go relay · py engine · node realtime · Meilisearch · Java slot
packages/shared  DCCNN codes + types + contracts — one source of truth
infra            docker-compose: postgres · redis · meilisearch · caddy
```

## Service map

| Service | Stack | Its one job |
| --- | --- | --- |
| client | Next.js + PWA | the face; installable home-screen app, offline shell, Media Session |
| server | Node/TS + Postgres (Drizzle) | accounts, auth glue, playlists, prefs, history — the JSON brain |
| services/go | Go | byte relay: range, cache-tee, upstream-death handling — the hot path |
| services/py | Python | the muscles only Python has: yt-dlp, ffmpeg, mutagen |
| services/node | Node | SSE gateway + BullMQ workers (live download progress, job state) |
| services/search | Meilisearch | typo-tolerant instant search — configure, don't write |
| services/analyze | Java (later phase) | EBU R128 loudness, waveforms, fingerprints |
| infra | Redis · Caddy | Redis: cache/queue/rate-limit/pubsub. Caddy: edge TLS + headers |

## Talking rules (the contract)

1. **client → server only.** The browser never touches a service directly; server proxies/gateways.
2. **server ⇄ services**: plain HTTP/JSON + Redis pub/sub for events. One bus, no spaghetti.
3. **Every service is optional.** Relay down → server serves bytes itself. Search down → server's own index. Six runtimes must never mean six single points of failure.
4. **`packages/shared`** defines every contract. Client and server both import it; drift is impossible.

## Sacred (non-negotiable, carried from CLAUDE.md)

- `_file_id()` MD5 identity + `.track_map.sqlite` — downloaded files keep their identity.
- yt-dlp `.part` resume semantics — ported, not reinvented.
- DCCNN error codes + `[ERROR_CODE: DCCNN]` chips — becomes the shared package.
- Clerk — same accounts, no migration.
- ENV fails closed; owner-scoped download jobs; the cache-invalidation chain (stream + track index).

## Decisions (locked with the user)

| Decision | Choice |
| --- | --- |
| TS backend | Separate `apps/server` (Node/TS); Next API routes only for client-local needs (health, SSE proxy) |
| Database | Postgres + Drizzle (accounts may stay in Mongo initially) |
| Python carve | Slim engine only: yt-dlp, ffmpeg, tagging, resume |
| Go relay | Agent writes it (Phase 1); user reviews. Contract below |
| First demo | Music playing (browse → play → hear audio fastest) |
| PHP | Skipped — no natural slot |
| Java analyze | Reserved slot, later phase |
| APK | Replaced by PWA (Media Session, offline shell, install prompt) |
| Skills | User maintains a dedicated folder at repo root (`skills/`); agent reads it fresh each session and applies immediately |

## Deployment posture (locked)

Termux is not a design constraint:

- **Docker** — `infra/compose.yml` for dev parity, `compose.prod.yml` for prod; per-app Dockerfiles under `infra/docker/`.
- **GitHub Actions** — CI matrix across Node, Go, Python; images published on main.
- **Scale path** — any Docker host (VPS, Fly.io, Railway, or bigger) with zero code changes; services-optional design kept for resilience, not device limits.

## The eight-phase workflow (multi-model)

The migration runs as a structured relay between models. The user controls
the model per session; **the repo is the baton** — every phase writes its
output into `docs/migration/` so the next phase (and the next model) picks
up files, not chat memory.

| # | Phase | Work | Default model | Output (committed) |
| --- | --- | --- | --- | --- |
| 1 | Discover | inspect web, api, services, deps, configs, data flows, architecture relationships | GLM 5.3 Flash | `docs/migration/01-discovery.md` |
| 2 | Architecture | constraints, risks, technology comparison, target architecture | GLM 5.3 Flash + Solar Pro 4 | `docs/migration/02-architecture.md` + ADRs |
| 3 | Documentation | technical docs, dependency references, system specs, diagrams, conventions, runbooks | Solar Mini 4 + Solar Pro 4 | `docs/migration/03-*` |
| 4 | Migration plan | dependency-aware sequencing, milestones, prerequisites, risks, rollback, acceptance conditions | GLM 5.3 Flash | `docs/migration/04-plan.md` |
| 5 | Implementation | incremental execution, always-green, continuous validation | DeepSeek V4.1 Flash | code + `docs/migration/05-log.md` |
| 6 | Testing | unit, integration, contract, e2e, regression, performance, migration-specific | DeepSeek V4.1 Flash | tests + `docs/migration/06-test-report.md` |
| 7 | Adversarial review | hunt hidden failures in architecture, implementation, tests, security, performance, assumptions | GPT-6 Luna + GLM 5.3 Flash | `docs/migration/07-review.md` + filed issues |
| 8 | Final validation | verify against requirements, plan, docs, tests, acceptance criteria, rollback readiness | GLM 5.3 Flash | `docs/migration/08-signoff.md` |

Rules of the relay:

- A phase is **done** when its output document is committed — not when a chat says so.
- A phase may not start before its predecessor's output exists.
- Findings from Phase 7 that block sign-off loop back into Phase 5 with the plan amended.
- Model assignments are the user's; the agent cannot switch its own model. Sessions on other models are pointed at this file and the relevant phase output.

## Build milestones (inside Phase 5)

| # | Milestone | Done when |
| --- | --- | --- |
| 0 | Skeleton: monorepo, Next boots with Rheoson design tokens, error-page system ported | the new app opens and looks like Rheoson |
| 1 | Play: stream/artwork/search/lyrics through go-relay + server; py-engine carved | pressing play produces sound |
| 2 | Sign in: Clerk + Postgres accounts, prefs, history, playlists | likes and settings follow you in |
| 3 | Download: BullMQ + node workers, SSE progress, resume intact, shared DCCNN codes | live progress + red fail toast with a code |
| 4 | The verdict: Redis everywhere, parity checklist, side-by-side run → promote `apps/*`, remove `web/` + `api/` — or archive | decision executed |

Skills (repo `skills/` folder, read fresh each session): design phases use
`design-taste-frontend`, `ui-ux-pro-max`, `design-motion-principles`,
`high-end-visual-design`; implementation additionally uses
`full-output-enforcement`; scope discipline uses `product-manager`.
Engineering phases (1, 2, 4, 7, 8) run on plain analysis — design skills
stay out of architecture documents.

## Integration contract for services/go

- `GET /relay/audio?track={id}&range=…` → streams CDN bytes with Range support, mirrors Content-Length/Content-Range, tees whole-file responses to the cache dir, and **never raises on upstream death** — ends the response and reports `{relayed, expected, error}` via `X-Relay-Status` header or a one-line JSON log.
- `GET /relay/health` → liveness for the fallback check.
- Config by env: `RELAY_PORT`, `CACHE_DIR`, `UPSTREAM_RESOLVER` (points at server or py-engine).
- server treats it as optional: probe `/relay/health`, fall back to Node byte-serving when absent.

## Folder structure

```
Rheoson/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── client.yml
│       ├── server.yml
│       ├── relay.yml
│       └── docker.yml
├── apps/
│   ├── client/
│   │   ├── public/
│   │   │   ├── assets/
│   │   │   ├── icons/
│   │   │   ├── manifest.json
│   │   │   ├── robots.txt
│   │   │   └── sitemap.xml
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   ├── globals.css
│   │   │   │   ├── not-found.tsx
│   │   │   │   ├── error.tsx
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── sign-in/
│   │   │   │   │   └── sign-up/
│   │   │   │   ├── (main)/
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── home/
│   │   │   │   │   ├── search/
│   │   │   │   │   ├── library/
│   │   │   │   │   ├── downloads/
│   │   │   │   │   ├── albums/
│   │   │   │   │   ├── artists/
│   │   │   │   │   ├── playlists/
│   │   │   │   │   ├── stats/
│   │   │   │   │   ├── settings/
│   │   │   │   │   └── error/
│   │   │   │   └── api/
│   │   │   │       ├── health/
│   │   │   │       └── events/
│   │   │   ├── components/
│   │   │   │   ├── player/
│   │   │   │   ├── queue/
│   │   │   │   ├── track/
│   │   │   │   ├── album/
│   │   │   │   ├── artist/
│   │   │   │   ├── playlist/
│   │   │   │   ├── home/
│   │   │   │   ├── search/
│   │   │   │   ├── library/
│   │   │   │   ├── downloads/
│   │   │   │   ├── settings/
│   │   │   │   ├── layout/
│   │   │   │   ├── errors/
│   │   │   │   └── ui/
│   │   │   ├── hooks/
│   │   │   ├── store/
│   │   │   ├── lib/
│   │   │   ├── themes/
│   │   │   └── types/
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   ├── postcss.config.mjs
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── gateways/
│   │   │   ├── auth/
│   │   │   ├── cache/
│   │   │   ├── queue/
│   │   │   ├── events/
│   │   │   ├── db/
│   │   │   │   ├── schema/
│   │   │   │   ├── migrations/
│   │   │   │   └── seed/
│   │   │   ├── lib/
│   │   │   └── types/
│   │   ├── tests/
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   └── services/
│       ├── go/
│       │   ├── cmd/
│       │   │   └── relay/
│       │   │       └── main.go
│       │   ├── internal/
│       │   │   ├── relay/
│       │   │   ├── cache/
│       │   │   ├── resolver/
│       │   │   └── config/
│       │   ├── go.mod
│       │   └── go.sum
│       ├── py/
│       │   ├── app/
│       │   │   ├── main.py
│       │   │   ├── routes/
│       │   │   ├── services/
│       │   │   └── core/
│       │   ├── tests/
│       │   ├── pyproject.toml
│       │   └── uv.lock
│       ├── node/
│       │   ├── src/
│       │   │   ├── index.ts
│       │   │   ├── workers/
│       │   │   ├── sse/
│       │   │   ├── events/
│       │   │   └── lib/
│       │   ├── tests/
│       │   ├── package.json
│       │   └── tsconfig.json
│       ├── search/
│       │   └── settings.json
│       └── analyze/
│           └── README.md
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── error-codes/
│       │   ├── types/
│       │   ├── contracts/
│       │   ├── validation/
│       │   └── constants/
│       ├── tests/
│       ├── package.json
│       └── tsconfig.json
├── infra/
│   ├── compose.yml
│   ├── compose.prod.yml
│   ├── docker/
│   │   ├── client.Dockerfile
│   │   ├── server.Dockerfile
│   │   ├── relay.Dockerfile
│   │   ├── engine.Dockerfile
│   │   └── worker.Dockerfile
│   ├── caddy/
│   │   └── Caddyfile
│   ├── postgres/
│   ├── redis/
│   └── meilisearch/
├── skills/
├── web/
├── api/
├── docs/
└── scripts/
```
