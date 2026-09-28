<div align="center">

<img src="docs/assets/logo.png" width="96" height="96" style="border-radius:24px" alt="Rheoson" />

# Rheoson

**Self-hosted music. No subscription. No ads. No compromise.**

Search, stream, and download any song with a Spotify-grade interface that runs entirely on your own server.

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)](https://fastify.dev)
[![Go](https://img.shields.io/badge/Go-1.23-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)](https://python.org)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

[Docs](docs/README.md) · [Experiment log](docs/EXPERIMENT_NEXT.md) · [Report a Bug](https://github.com/picklem0b/Rheoson/issues)

</div>

---

> **Which branch is this?** This is `experiment/nextjs` — the architectural rebuild. The shipping app (React 18 + Vite + FastAPI) lives on `main` and `dev`. This branch keeps the product, the muscle (yt-dlp, ffmpeg, track identity), and the hard-won lessons — and replaces the structure around them.

## The shape

```
Rheoson/
├── apps/
│   ├── client/          Next.js 15 full website + PWA (the only frontend, no APK)
│   ├── server/          Fastify 5 + TypeScript — API core, Clerk auth, Postgres/Drizzle
│   └── services/
│       ├── go/          Stream relay — bytes, range requests, cache-tee
│       └── py/          Engine — yt-dlp, ffmpeg, library scan, track identity, matching
├── packages/
│   └── shared/          The DCCNN error-code registry + contracts (one source, both languages)
├── infra/               Dockerfiles, compose, Caddy — how it all ships
└── docs/                Architecture, migration log, test reports, sign-off
```

**Ownership split.** The *social brain* (accounts, prefs, likes, history, playlists, messaging, stats) lives in Postgres behind the Fastify server. The *muscle* (files, downloads, track identity, stream bytes) stays with the services — the Python engine owns the disk facts, the Go relay owns the bytes. The client talks to the server; the server talks to the services.

**Errors are a contract.** Every failure carries a DCCNN code (`D`omain `C`ategory `N`umber, e.g. `DOWNLOAD · EXTRACTOR · 01`) registered once in `packages/shared` and exported to the Python engine at build time — a drift between languages fails CI, not a user.

## Requirements

- Node.js 22+, pnpm 9+
- Python 3.13 + [uv](https://docs.astral.sh/uv/) (engine)
- Go 1.23+ (relay)
- Postgres 16 (server) — `docker` is the easy way
- ffmpeg + yt-dlp on PATH for real downloads (the engine locates them for you)

## Quick Start

```bash
git clone https://github.com/picklem0b/Rheoson.git
cd Rheoson
pnpm install

# Postgres (or point DATABASE_URL anywhere else)
docker run -d --name rheoson-pg -p 5432:5432 \
  -e POSTGRES_USER=rheoson -e POSTGRES_PASSWORD=rheoson -e POSTGRES_DB=rheoson postgres:16

# Everything, in parallel
pnpm dev
```

| Surface | URL |
|---|---|
| Client (Next.js) | http://localhost:3000 |
| Server (Fastify API) | http://localhost:4000 |
| Ops console | http://localhost:3000/admin |
| Engine (Python) | http://localhost:8000 |
| Relay (Go) | http://localhost:8087 |

Without Clerk keys the server runs in the **dev posture**: identity comes from the `X-Dev-User` header against an allow-list. With keys set, Clerk verification switches on and the dev posture is unavailable — ENV fails closed.

## Testing

```bash
pnpm test          # everything: shared, server, client
pnpm typecheck     # tsc across the workspace
pnpm lint          # eslint across the workspace
pnpm build         # turbo build (client is the slow one)

# Engine (pytest + pyflakes)
cd apps/services/py && uv sync --extra dev && uv run python -m pytest -q

# Relay
cd apps/services/go && go test ./... && go vet ./...
```

Counts at time of writing: engine **151**, server **83**, client **91**, shared **14**, relay **20** — all green. A live end-to-end suite (`RHEOSON_LIVE=1`) exercises real YouTube resolution and a real download.

## Documentation

| Document | Contents |
|---|---|
| [docs/EXPERIMENT_NEXT.md](docs/EXPERIMENT_NEXT.md) | The experiment: goals, phases, rollback story |
| [docs/migration/01-discovery.md](docs/migration/01-discovery.md) | Phase 1 — what the old stack actually was |
| [docs/migration/05-log.md](docs/migration/05-log.md) | Milestone-by-milestone build log with decisions |
| [docs/migration/06-test-report.md](docs/migration/06-test-report.md) | Gate results and live-run evidence |
| [docs/migration/08-signoff.md](docs/migration/08-signoff.md) | Gaps, known limits, audit trail |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design |
| [GIT_WORKFLOW.md](GIT_WORKFLOW.md) | Branches, commits, the `next-v*` tag convention |

Every milestone lands behind an annotated `next-vX.Y.Z` tag — any point in the migration is a rollback target.

## Licence

Apache-2.0 — see [LICENSE](LICENSE).

This licence covers the Rheoson source code only. It does not grant rights to audio content downloaded through Rheoson. You are responsible for complying with copyright law in your jurisdiction.

---

**Built by LethaboK** — [github.com/picklem0b](https://github.com/picklem0b)

> *Built in Termux on Android. Sounds like a proper server.*
