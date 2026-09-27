# Phase 6 — Test report

> Phase 6 of 8 · Owner: DeepSeek V4.1 Flash session (recorded here)
> Run against `experiment/nextjs` at `next-v0.12.0`.
> The useful half of a test report is the list of things a test cannot prove.

## 1. Result

| Suite | Command | Result |
| --- | --- | --- |
| Contracts (`packages/shared`) | `pnpm test` | **14 passed** |
| Server (`apps/server`) | `pnpm test` | **62 passed**, 10 skipped (Postgres-gated) |
| Server + Postgres | `RUN_DB_TESTS=1 pnpm test` | **72 passed** (CI job `server-integration`) |
| Client (`apps/client`) | `pnpm test` | **71 passed** |
| Engine (`apps/services/py`) | `uv run python -m pytest -q` | **118 passed** |
| Relay (`apps/services/go`) | `go test ./...` | **20 passed** (CI adds `-race`) |
| **Total** | | **295** (285 with the ten DB-gated cases skipped) |

Workspace gates: `turbo run typecheck lint test build` → **12/12 tasks**, no
warnings. `pyflakes app tests conftest.py` clean. `gofmt -l` empty,
`go vet ./...` clean. `next build --webpack` prerenders 10 routes.

The engine suite was run **three times end to end** after the last fix, because
it is the one suite that drives real subprocesses: a green single run is not
evidence that the race in §3.7 is gone.

## 2. What the suites actually prove

### 2.1 Engine (Python) — 118

| Area | What is pinned |
| --- | --- |
| Identity map | one-way record, both-direction lookup, file→one-video uniqueness, cache invalidation, degraded reads never raise |
| Library scan | hidden directories are never content (`.staging` holds half-written downloads), a mapped file reports its **videoId**, `file_id` is path-derived and stable, caching is invalidated on demand |
| Tagging | a real generated WAV round-trips through the writer; an unreadable file falls back to filename-derived metadata instead of vanishing; a broken file returns `False` rather than raising |
| Downloads | **driven by a real subprocess.** Success (file lands as `Artist/Title.ext`, identity recorded, stage removed), refusal (`DEX01` + the tool's own words), staged-bytes reporting, **resume appending 4+4 bytes rather than restarting**, fresh retry discarding the stage, owner scoping, duplicate `DCN01`, queue ceiling `DLM01`, input validation before any spawn, missing engine `DEN02`, restart-interrupted jobs marked failed-and-resumable |
| Resolution | the client ladder, refusal vs transport classification, invalid ids refused before any subprocess |
| HTTP surface | local bytes with full range semantics (206, open-ended, suffix, 416), HEAD without a body, artwork `SUP04`, empty query `RVA04`, lyrics `RNF01`, download routes refusing an unowned job, **one track by id (`/library/tracks/{id}`: found, `TNF01`, traversal refused)** |
| Search | local matching, case handling, empty query returns nothing rather than everything, remote skipped without the tool, merged results never duplicate a local hit |

### 2.2 Server (TypeScript) — 72

| Area | What is pinned |
| --- | --- |
| Preferences whitelist | unknown keys dropped, wrong types dropped, **`true` refused where a number belongs**, numbers clamped, strings bounded, non-objects become empty patches, `EVA07` on a malformed request |
| Engine client | owner header attached, engine codes passed through, engine 5xx never leaking as an uncoded error, unreachable engine naming the missing capability, opaque byte relay, health as a boolean |
| Download proxy | snake→camel shaping, owner scoping on every read and mutation, **validation before the request is made**, title bounded, resume tri-state (`undefined` ≠ `false`) |
| Accounts (Postgres) | idempotent like/unlike and counts, per-user scoping, history listed once but counted every time, follows, playlist order through add/remove/reorder, `PCN02` duplicate, `PVA07` partial reorder, **another user's playlist answers `PNF01` rather than `403`** |
| Messaging (existing) | rate limit `MLM01`, presence, wire format |
| Streaming (existing) | relay-first, direct fallback, upstream-death mapping |
| Realtime bus | local fan-out reaches every subscriber of one user and nobody else's, unsubscribe drops the channel, **a throwing subscriber cannot starve the others**, multi-user publish |

### 2.3 Client (Next.js) — 71

| Area | What is pinned |
| --- | --- |
| API contract | coded errors, registry fallback copy, `isPageStatus`, **5xx escalates to the error page**, quiet callers never escalated, a network failure becomes a coded 503 |
| Toasts | pass has no code, **fail always has one** (`UNCODED` when a developer forgets), errors never auto-dismiss, stack capped, ⓘ reveals the reason and closes on Escape |
| Queue | **the playing track is never listed twice**, cursor shifts correctly when an earlier track is removed, shuffle restores the original order without moving the playing track, repeat semantics |
| Downloads | progress replaces a row, completion announced once, failure announced with the code and the engine's words |
| SSE | frame parsing, multi-line data, comments ignored, non-JSON payload surfaced rather than dropped |
| Error pages | every status renders its own label and its own panel copy; the fallback is 500-shaped |
| Formatting | durations, byte sizes, ETAs, locale-independent dates |
| Favourites | optimistic flip and rollback, `TEX01` on a failed like and on an uncoded one, the server list is read once and a failed read stays retryable |

### 2.4 Contracts and relay

DCCNN uniqueness, section non-overlap and wire format; drift between the
registry and its committed JSON export fails CI. The relay's range arithmetic,
cache tee promotion (whole-file only, rename-based) and upstream-death
reporting were already covered when the relay landed.

## 3. Bugs the tests found (this is the section that matters)

Every one of these was a real defect, not a test-authoring mistake:

1. **A job could finish in a different directory than it started.** The data
   directory was re-resolved at each step, so a job created under one
   environment could stage and finalise under another. Fixed by capturing the
   directory on the job at creation. In production the environment never changes
   mid-process — which is exactly why it would have shipped.
2. **The library cache was not keyed by its root.** The same class of bug: a
   cached listing is only true of one directory.
3. **The identity table was created only by a boot hook.** A read before the
   hook ran failed with "no such table". Now the schema is created lazily by the
   first read or write.
4. **WAV tagging used the wrong writer.** A RIFF container keeps tags in a
   chunk; a bare ID3 block writes fine and reads back as nothing.
5. **Engine test data could survive between runs.** A repo-relative test data
   directory let a previous run's downloads look like a real library, which made
   a network-resolution test pass for the wrong reason. Tests now get a fresh
   temp directory per session.
6. **`Cross-Origin` audio is a silent failure mode.** Discovered while designing
   the effects chain: connecting a media element to Web Audio without usable CORS
   headers produces *silence*, not an error. The graph is therefore opt-in, and
   default playback never depends on it (see `07-review.md` F2).
7. **A job snapshot could read `{"status": "running", "active": false}`.**
   `_with_resume_fields` built the payload from `job.to_dict()` and then read
   `job.status` again for the derived fields, so a worker finishing between the
   two reads produced a snapshot that contradicted itself. This is the kind of
   bug a *flaky* test finds and a green run hides: it failed roughly one run in
   three, and only when another test file ran first. The fix reads the status
   once, under the lock, and derives every field from that single value — the
   client's resume UI keys on exactly those two fields, so the old behaviour was
   a real lie about whether a download could be resumed.

## 4. What is NOT verified (stated, not hidden)

| Gap | Why | Consequence |
| --- | --- | --- |
| **No end-to-end run against a real YouTube track** | the dev host has no network guarantee and no `yt-dlp` in CI; the tests drive a stub binary | the download *pipeline* is proven; the extraction ladder's live behaviour is not. It is ported verbatim from the version that works in production |
| **Docker image builds** | no Docker daemon on the dev host | they build for the first time in CI; a broken Dockerfile is a CI failure, not a local one |
| **`go test -race`** | ThreadSanitizer rejects the Termux VMA range | plain `go test` passes locally; CI runs `-race` |
| **Browser playback, Media Session, PWA install** | no browser automation available | the stores are unit-tested; the `<audio>` element wiring needs a device |
| **Clerk sign-in end-to-end** | no publishable key in this environment | the server verifies Clerk JWTs and fails closed; the client mounts `ClerkProvider` + `clerkMiddleware` when a key is present (ADR-10) and boots on the dev identity when it is not. The browser flow itself needs keys |
| **Redis-backed fan-out with two instances** | compose has one server process and the dev host runs no daemon | the transport switch, its fallback and the local path are unit-tested; the cross-instance hop needs a two-instance stack |
| **The 5xx → page bridge in a real browser** | as above | the handler is unit-tested; the navigation needs a session |
| **Termux on-device run of the new stack** | the target is a Docker host by decision (ADR from discovery §deployment) | the compose stack is the supported path |

## 5. Coverage by construction, not by percentage

No coverage number is quoted, deliberately: a percentage counts lines a test
executed, and the failures that matter here — a staged byte thrown away, a
duplicate toast, a silent Web Audio graph — are not line-shaped. What follows
instead is the reasoning behind the suites:

* **Anything with a subprocess is tested with a subprocess.** The download tests
  run a fake `yt-dlp` that reports progress, writes files and can die halfway.
  A mocked subprocess would have asserted the mock, not the pipeline.
* **Anything with SQL is tested with SQL** (CI job, real Postgres). Mocking
  Drizzle proves nothing about a unique constraint or `ON CONFLICT`.
* **Pure decisions are tested as pure functions** — the preferences whitelist,
  the DCCNN wire format, index arithmetic, SSE framing, formatters.
* **Anything unreachable in this environment is listed above** rather than
  papered over.
