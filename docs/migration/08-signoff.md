# Phase 8 — Final validation and sign-off

> Phase 8 of 8 · Owner: the human auditor (this document is the checklist, not
> the verdict) · Target: `experiment/nextjs` at `next-v0.12.0`.
>
> Two claims are kept apart on purpose. **What the implementation verified** is
> recorded below with the command that proves it. **What only you can close** is
> in §4 — every item there is a thing this environment cannot do, not a thing
> that was skipped for convenience. `next-v1.0.0` is the promotion tag and is
> withheld until §5 is signed.

## 1. The requirements, checked one at a time

| # | Requirement (from the brief) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Keep the web and api working as the reference while building `apps/*` | ✅ | `web/` and `api/` are untouched on `main`; nothing in `apps/*` or `packages/*` imports from them |
| 2 | Reuse the working code rather than re-inventing it | ✅ | the DCCNN registry, the client ladder, the staging/resume semantics, the range arithmetic, the two-shell layout and the token layers were ported with tests naming the rule they carry |
| 3 | Then focus on `apps/*` independently | ✅ | `apps/client` (Next.js), `apps/server` (Fastify), `apps/services/go` (relay), `apps/services/py` (yt-dlp · ffmpeg · tagging · identity) |
| 4 | Use Redis and other stacks where they earn their place | ✅ | Redis: live as the realtime fan-out transport (ADR-6), with local fan-out as the tested fallback. Postgres: the social brain. meilisearch: slot present, **not** wired — §4.6 |
| 5 | `apps/{services, client, server}` layout | ✅ | `apps/services/{go,py}` · `apps/client` · `apps/server` · `packages/shared` |
| 6 | Ship to production before feature development | ⚠️ | the stack is deployable today (compose + prod overlay + Caddy + four images + a CI lane). The **first real deploy is yours** — §4.1 |
| 7 | Every error carries a traceable code | ✅ | one 122-code registry (`packages/shared`), exported to JSON and consumed by the Python engine, so the two languages cannot drift. Client toasts require a code by type; a missing one shows `UNCODED` rather than pretending |
| 8 | Error pages for 404/401/403/429/500/502/503/504, minimal, with an ⓘ panel | ✅ | `apps/client` error-page system: per-status label **and** per-status panel copy, keyboard/touch reachable, 500-shaped fallback |
| 9 | Pass/fail toasts (green pass, red fail with a code and ⓘ) | ✅ | `toast.store` + `ToastHost` + their tests |
| 10 | Downloads work, with resume and honest failures | ⚠️ | the pipeline is proven against a real subprocess; the **live extraction against YouTube is §4.2** (the brief's original failure) |
| 11 | No warnings anywhere | ✅ | `turbo run typecheck lint test build` → 12/12, warning-free; pyflakes, gofmt, `go vet` clean |
| 12 | Plan first, then execute, with a rollback point per slice | ✅ | 14 annotation tags, `docs/EXPERIMENT_NEXT.md` and `docs/migration/*` |
| 13 | A machine can run it too, not just a phone | ✅ | compose is the supported path (§5 step 3) |

## 2. Gates — run these yourself and compare

```bash
# from the repository root
pnpm install
pnpm exec turbo run typecheck lint test build      # expect: 12/12 tasks

cd apps/services/py && uv sync --extra dev
uv run python -m pytest -q                          # expect: 118 passed
uv run python -m pyflakes app tests conftest.py     # expect: no output

cd ../go && go vet ./... && gofmt -l . && go test ./...   # expect: clean · 20 tests

cd ../../..
docker compose -f infra/compose.yml config                 # expect: valid
docker compose -f infra/compose.yml -f infra/compose.prod.yml config
```

Recorded baseline at `next-v0.12.0`:

| Gate | Result |
| --- | --- |
| `turbo run typecheck lint test build` | **12/12**, warning-free |
| Engine (`pytest`) | **118 passed**, run three times to catch the subprocess race in §3.7 |
| Server (`vitest`) | **62 passed**, 10 skipped (Postgres-gated; CI runs all 72) |
| Client (`vitest`) | **71 passed** |
| Shared (`vitest`) | **14 passed** |
| Relay (`go test`) | **20 passed** |
| `pyflakes` · `gofmt -l` · `go vet` | clean |

## 3. Parity — the current app, behaviour by behaviour

The full table is in `04-plan.md` §5. Summary: **20 of 22 ✅**, one ⚠️ (PWA
install and lock-screen controls need a device), one ❌ (Android foreground
service — the PWA replaces the APK, so a background download on Android is a
documented open item), and backup export/restore is intentionally not ported
(`api/app/services/backup_service.py` is the migration input, and Render's
ephemeral disk is why it exists).

Three behaviours are **better** than the current stack, and it is worth saying
which, because a rewrite that is only equal is not worth the migration:

1. Every error is traceable to one raise site by code (`[ERROR_CODE: …]`).
2. A service outage costs reliability, not availability: relay down → direct
   streaming; engine down → a coded 503 that says which capability is missing.
3. Realtime fan-out scales past one process without the client changing.

## 4. What this environment could not close (your audit)

| # | Gap | How to close it | What failure would look like |
| --- | --- | --- | --- |
| 1 | **Docker image builds** — no daemon on the authoring host | run the CI `docker` job, or `docker compose -f infra/compose.yml build` on the target | a Dockerfile is wrong; the stack never starts |
| 2 | **Live YouTube download** — the tests drive a stub `yt-dlp` | `docker compose up`, then download a real track with `yt-dlp` present in the engine image; watch the progress bar and the file landing in `MUSIC_DIR/Artist/Title.m4a` | the extraction ladder needs re-tuning (it is the thing that breaks regularly, which is why the daily-update cron and the Doctor's repair exist in the current stack) |
| 3 | **Browser playback, seek, Media Session, PWA install** | open the client on a device, play, seek, background it | the `<audio>` wiring is unit-tested; the element itself is not |
| 4 | **Clerk sign-in end-to-end** — no publishable key here | set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` + `CLERK_WEBHOOK_SECRET`, then sign in | the session bridge or the webhook mirror is misconfigured |
| 5 | **`go test -race`** — ThreadSanitizer rejects the Termux VMA range | CI runs it; locally it needs a real host | a data race in the relay's tee path |
| 6 | **Redis cross-instance fan-out** — one server process in compose | run two `server` replicas against one Redis, connect two browsers, send a message | the transport falls back to local and a cross-instance event is lost (the code warns and `/health` reports `bus`) |
| 7 | **Termux on-device run of the new stack** | the target is a Docker host by decision; Termux keeps running the current app | n/a by design |

## 5. Sign-off steps

```bash
# 1. Gates (must match §2)
pnpm exec turbo run typecheck lint test build

# 2. The stack
cp infra/.env.example infra/.env          # fill ENGINE_TOKEN, RELAY_TOKEN, Clerk keys
docker compose -f infra/compose.yml up --build

# 3. Smoke: is the API alive, and which bus is it on?
curl -s localhost:4000/health             # {"ok":true,"bus":"redis"}
curl -s localhost:8081/health             # engine capabilities + library stats

# 4. The real test: sign in, play a track, seek, download a track, break the
#    network mid-download and confirm the failure names its code.

# 5. Only then:
git tag -a next-v1.0.0 -m "..."           # promotion: the audit agreed
```

## 6. Promotion decision

**Recommended: promote on the `experiment/nextjs` branch after §5, keeping `main`
on the current stack until the first production deploy is observed for a week.**

Why not immediately: two requirements are ⚠️ (§1 rows 6 and 10) and both are
things only a live deployment proves. Why promote at all: everything else in the
brief is verified, gated and reversible — 14 annotated tags mean any slice can be
unwound without archaeology, and the reference implementation is still on `main`.

Rollback is documented in `04-plan.md` §7 and needs no new machinery: the branch
is not merged, and the tags are the map.
