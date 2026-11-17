# Rheoson

A music player for twenty people. You search a catalogue that is not ours, you play it from the provider that serves it, and everything you curate is yours and portable. No audio is hosted here, nothing is downloaded from a service that forbids it, and the infrastructure bill is zero.

## Status

V3 is being rebuilt on `development` from `main`'s commit, and phase 0 (`v3.0.1` to `v3.0.9`) is the environment: the workspace, the contracts, the worker, the web shell and the gates. Nothing plays music yet; the roadmap says when that changes.

| Branch | Runs | Purpose |
| --- | --- | --- |
| `main` | V2 today, V3 from phase 10 | production |
| `dev` | V3 candidate from phase 9 | review and testing before production |
| `development` | V3 | the branch everything lands on |

## Layout

```
web/                Vite + React SPA, static assets on Vercel
api/                Hono on Cloudflare Workers, /api/v1, Drizzle over Neon
packages/shared/    zod contracts, envelope, error registry, track identity
docs/               PRD, ARCHITECTURE, DESIGN, ROADMAP
skills/             agent skills the work is done with
.github/workflows/  typecheck, lint, build and a worker dry run
```

## Quickstart

```bash
pnpm install
pnpm dev:api        # wrangler dev on 127.0.0.1:8787
pnpm dev            # vite on 3000, /api proxied to the worker
```

Web and API are separate origins in production, so the client reads its base URL from `VITE_API_BASE_URL`. Development leaves it unset and the Vite proxy keeps every request same-origin.

## Environment

| Variable | Where | What it does |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `web/.env` | API origin plus `/api/v1`; unset means same-origin |
| `APP_ORIGINS` | worker secret | comma-separated exact origins allowed to call the API |
| `DATABASE_URL` | worker secret | Neon connection string; absent means the app runs without a database |
| `CLERK_JWKS_URL` | worker secret | verifies session tokens |
| `CLERK_ISSUER` | worker secret | expected `iss` claim |
| `RATE_LIMIT_PER_MINUTE` | worker var | per-caller window, default 120 |
| `ENVIRONMENT` | worker var | `development` or `production`; gates localhost CORS |

`web/.env.example` and `api/.dev.vars.example` are the tracked examples. The real files are ignored.

## Commands

| Command | Does |
| --- | --- |
| `pnpm typecheck` | every package, `tsc --noEmit` |
| `pnpm lint` | ESLint over the tree |
| `pnpm build` | the web app, typechecked first |
| `pnpm db:generate` | a migration from `api/src/db/schema.ts` |
| `pnpm db:migrate` | runs migrations against `DATABASE_URL` |

## Docs

[PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Design](docs/DESIGN.md) · [Roadmap](docs/ROADMAP.md) · [Git workflow](GIT_WORKFLOW.md) · [Agent rules](AGENTS.md)
