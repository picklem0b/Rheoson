# Phase 5 — Implementation log (Rheoson Next)

> Phase 5 of 8 · Agent: DeepSeek V4.1 Flash · Every slice lands on its own
> `next-vX.Y.Z` annotated tag so any point is a rollback target.
> Rule of the relay: a slice is done only when its gates are green
> (`typecheck · lint · test · build`) and the tag exists — not when a chat says so.

## M0 — Skeleton (complete · `next-v0.4.0`)

Done when **the new app opens and looks like Rheoson**: monorepo, Next boots
with the real design tokens, the error-page system is ported.

| Tag | Slice | Deliverable | Proof |
| --- | --- | --- | --- |
| `next-v0.1.0` | `packages/shared` | 122-code DCCNN registry, `[ERROR_CODE: …]` wire format, shared domain types — one source of truth both languages import | 8/8 contract tests (unique codes, section/letter integrity, format round-trip) |
| `next-v0.2.0` | `apps/server` | Fastify 5 core: Clerk auth + fail-closed dev posture, Clerk webhook mirror (svix), Postgres/Drizzle relational schema, messaging service (rate limit `MLM01`, DCCNN errors), Redis-backed event bus, REST + SSE routes, health | typecheck clean · 6/6 tests |
| `next-v0.3.0` | `apps/client` | Next.js 16 shell on the real primitive → semantic → component token layers, reusable `ErrorPage` (data-driven config for every HTTP state), App Router wiring: `not-found`, `error`, `/error/[code]` with `generateStaticParams`, home, vitest + RTL | lint · typecheck clean · 8/8 tests · production build prerenders all 9 error routes |
| `next-v0.4.0` | M0 wrap | turbo pipeline across the whole workspace; per-package ESLint flat configs; `next typegen` before client typecheck so `.next/types` exist at tsc time | `turbo run typecheck lint test build` → **12/12 tasks green** |

### Structural decisions made during M0

| Decision | Why |
| --- | --- |
| pnpm workspaces + turbo, Node ≥ 22 | one pipeline, cacheable per-package tasks, strict dependency layout |
| Next build pinned to **webpack**, not Turbopack | Turbopack cannot resolve pnpm's symlinked `node_modules` on this host; webpack is deterministic. Revisit when upstream lands the fix |
| `eslint-config-next@16` native flat config | Next 16 removed `next lint` and the FlatCompat bridge chokes on the legacy config; the package default-exports a flat array, so the bridge was deleted |
| Registry codes aligned to their real copy | the shared registry is truth: service call sites were corrected to match `MNF01: Conversation not found` etc., and the tests assert against the registry, not a guessed mapping |
| Client build outputs declared only for the client | the server and shared builds are `tsc --noEmit` by design; declaring outputs globally produced two warnings about tasks that legitimately emit nothing |
| Client typecheck depends on its own build | otherwise `next build` and `tsc` race over `.next/types` |

## M1 — Play (in progress)

Done when **pressing play produces sound**: the relay and engine are carved,
the server serves bytes, and the client plays them.

| Tag | Slice | Deliverable | Proof |
| --- | --- | --- | --- |
| `next-v0.5.0` | `apps/services/go` | The byte relay: verbatim `Range` forwarding, header mirroring, disk cache-tee with atomic promotion, upstream-death reporting (status header + trailer + one-line JSON), panic recovery, `/relay/health` | `go vet` clean · gofmt clean · **20/20** tests · **no third-party Go dependencies** |
| `next-v0.6.0` | engine + registry export | The Python engine carved to the muscles: toolchain resolution, DCCNN loader reading the exported registry, the measured player-client ladder, `/health`, `/resolve`, `/probe`, service-token auth, subprocess-argument safety. Registry published as a committed JSON artifact with a drift test | **37/37** engine tests · pyflakes clean · 14/14 shared tests · 12/12 turbo tasks |
| `next-v0.7.0` | server streaming | Two-tier serving: relay-first, then the server streams the resolved CDN URL itself. Range passthrough, header mirroring, one re-mint of a refused URL, in-flight health-probe coalescing, `/api/tracks/:id/stream`, `/api/tracks/:id/info` | **19/19** server tests · tsc + eslint clean · 12/12 turbo tasks · vitest 5 everywhere (no warnings) |
| `next-v0.8.0` | infra + CI | compose (dev) + prod overlay, four images, Caddy edge, `.env.example`, and a `next-ci.yml` covering shared/server/client/relay/engine/docker/compose | both compose configs validate · workflow is the only unverified piece (no Docker daemon on the authoring host) |

### Decisions and findings made during M1

| Decision / finding | Why it matters |
| --- | --- |
| **Trailers need a chunked response** | When an upstream declares `Content-Length`, the death report cannot ride a trailer — it goes in the one-line JSON log instead. The contract allows either, and the client detects truncation itself. Discovered by a failing test, not by a guess |
| **Partial responses never seed the cache** | A truncated tee would poison every later play. Only whole-file responses are promoted, and the promotion is a rename, so a reader never sees a partial entry |
| **Health probes are coalesced** | Three concurrent plays originally caused three probes. Coalescing in-flight probes matters most exactly when the service is already struggling |
| **The server un-mirrors a relay 5xx** | A relay that probed healthy but cannot serve a track falls through to the direct path: an internal service's failure must not become the listener's error |
| **`standalone` output is opt-in via `NEXT_STANDALONE=1`** | Only the container needs the traced bundle; local and turborepo builds keep the plain output instead of paying tracing cost for an artifact nothing reads |
| **Track ids are validated in three places** | `/^[A-Za-z0-9_-]{1,64}$/` in shared TS, in the engine before a subprocess, and implicitly by the relay's cache-path guard. The value crosses a URL and an `argv`, so one guard is not enough |
| **vitest 5 across the workspace** | vitest 2 loaded Vite's CJS build and warned on every run; one runner version means a failure reproduces in any package |

### Remaining for M1

| Piece | Why it is last |
| --- | --- |
| Client playback wiring | The largest remaining surface: player store, audio cache, effects chain, transport UI. It is the only piece where "press play, hear sound" is decided, and it deserves its own verified slice rather than being rushed in behind the infrastructure |
| Local-library tier (`_file_id`, `.track_map.sqlite`) | Remote playback must be honest first; the local tier arrives with the download engine in M3 so the identity contract is exercised once, not twice |
