# Development Guide

> Companion pages: [Contributing](CONTRIBUTING.md) (rules and PR bar), [Git Workflow](../GIT_WORKFLOW.md) (branches and tags).

## Setup

```bash
git clone https://github.com/picklem0b/Rheoson && cd Rheoson

# Backend (Python 3.13+, ffmpeg on PATH)
cd api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"            # or: uv venv && uv pip install -e ".[dev]"
cp .env.example .env               # defaults work for local dev, no Clerk needed

# Frontend
cd ../web
npm install
```

Run the stack:

```bash
# Terminal 1 — API (note: socket_app, not app)
cd api && uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Web (proxies /api → :8000)
cd web && npm run dev
```

Dev mode with no Clerk configured issues a synthetic local identity — you can develop everything without accounts. Setting `CLERK_SECRET_KEY` in `api/.env` and `VITE_CLERK_PUBLISHABLE_KEY` in `web/.env` switches both sides to real Clerk.

## Quality gates

All four must pass before pushing — CI checks the first three per PR (see `.github/workflows/ci.yml`):

```bash
# Backend
cd api
pytest -q                                   # hermetic suite — no network, no real DB/Clerk
pyflakes app/                               # zero findings
mypy app/ --ignore-missing-imports          # informational baseline; do not add new errors

# Frontend
cd web
npm run typecheck                           # tsc --noEmit
npm run lint                                # eslint, zero warnings
npm test                                    # vitest
npm run build                               # production build must succeed
```

## Test suite conventions

The backend suite is **hermetic**. `api/tests/conftest.py` patches exactly four seams — `get_db`, `connect_db`, `close_db`, `verify_clerk_token` — and injects a mock DB + fake token registry. Tests never touch the network, MongoDB, Clerk, or your real music library (`MUSIC_DIR` is forced to a temp dir; per-user state files are cleaned between tests).

When you add an endpoint:

1. Anonymous request → must 401: add a probe to `test_stateful_endpoints_require_auth`.
2. Per-user data → add/extend an isolation test (fixture pair `client` / `client_as_other_user`).
3. Validation edge (bad ID, path escape, oversized input) → assert the 400/422.
4. New public-by-design route → document the justification in the router and in [Auth & Security](AUTH.md#public-surface-deliberate).

Frontend tests live in `web/src/__tests__/` (vitest + jsdom). Router/auth regressions pin the route table directly — see `authRoutes.test.ts` for the pattern.

## Project conventions

- **Backend**: routers thin, services smart, core dependency-free. Type hints everywhere; `pydantic` schemas for all I/O. structlog for logging (`log.info("event.name", key=value)`), request IDs via middleware.
- **Frontend**: one Zustand store per concern; React Query for all server state; API access only through `src/api/*` modules (never raw `fetch` in components).
- **Commits**: Conventional Commits (`feat(search): …`, `fix(stream): …`) — see [GIT_WORKFLOW.md](../GIT_WORKFLOW.md).
- **Branches**: `feature/*` and `fix/*` off `dev`; PRs target `dev`.

## Versioning & releases

Version lives in four synced files — bump them together:

1. `api/pyproject.toml` → `version`
2. `api/app/main.py` → `VERSION`
3. `web/package.json` → `version`
4. `web/src/lib/constants.ts` → `APP_VERSION`

Release flow (full details: [GIT_WORKFLOW.md](../GIT_WORKFLOW.md#tagging-releases)):

```bash
git checkout main && git merge --no-ff dev
# annotated tag — never lightweight
git tag -a v2.17.0 -m "v2.17.0 — docs overhaul, CI test gates, auth route fix"
git push origin main --follow-tags
```

Tag annotation message: one line per notable change, imperative mood — it becomes the release notes body.

### Documentation maintenance at release time

1. Update the *last verified* stamp at the bottom of every doc in `docs/` that you reviewed this release.
2. Update [STATUS.md](STATUS.md) rows whose features changed.
3. Update [CHANGELOG.md](CHANGELOG.md) — the file currently lags git history; the release that touches it catches it up fully (see [Contributing → Documentation](CONTRIBUTING.md#documentation)).
4. CI runs the docs link/endpoint check (`.github/workflows/docs-check.yml`) on every PR — keep it green.

## Troubleshooting local dev

| Symptom | Cause / fix |
|---------|-------------|
| No download progress events | You ran `uvicorn app.main:app` — use `socket_app` |
| Every API call 401s | `.env` has a Clerk key set on the API but the frontend has none (or vice versa) — align both or clear both |
| Search works, play fails with 502 | yt-dlp/ffmpeg missing from PATH, or YouTube throttling — check `/api/health/diag` |
| Library empty after dropping files in | Wait for the cron scan or hit `POST /api/settings/rescan` |
| Tests fail with auth errors | You exported real `CLERK_*` vars in your shell — conftest sets test values; unset conflicting overrides |

---

*Last verified against `main`: 2026-09-10 (v2.16.5).*
