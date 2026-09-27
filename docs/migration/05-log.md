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

### Deferred out of M0 (deliberately, tracked)

- `next.config.ts` `output: 'standalone'` — re-enabled inside the Docker image in M1's infra work; it fights the workspace `distDir` on this host.
- Client-local API routes (`/api/health`, `/api/events`) — land with M1's playback wiring, where they have a real consumer.

## M1 — Play (next)

Done when **pressing play produces sound**: go-relay + py-engine carved from the
existing `api/` download/stream services, Redis + Postgres via compose, and
integration tests that boot the services and stream a real file.
