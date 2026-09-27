# Phase 4 — Migration plan

> Phase 4 of 8 · Owner: GLM 5.3 Flash session (recorded here)
> Inputs: `01-discovery.md`, `02-architecture.md`, `03-spec.md`.
> This is the plan the implementation followed, kept as written — including the
> dependencies it got wrong, corrected in place with a note rather than editted
> away (see §6).

## 1. Shape

Eight phases, but only one of them writes code. Phases 1–4 decide, 5 builds,
6 proves, 7 attacks, 8 signs. The repo is the baton: every phase writes its
output to a file so the next phase — and the next model — picks up documents,
not chat memory.

## 2. Milestones and their tags

| # | Milestone | Done when | Tag |
| --- | --- | --- | --- |
| 0 | Skeleton: monorepo, contracts, server core, Next shell with the design tokens and the error-page system | the new app opens and looks like Rheoson | `next-v0.1.0` – `next-v0.4.0` |
| 1 | Play: relay, engine carve, two-tier streaming, library, search, lyrics, client playback | pressing play produces sound | `next-v0.5.0` – `next-v0.9.0` |
| 2 | Sign in: accounts, preferences, likes, history, follows, playlists | likes and settings follow you in | `next-v0.10.0` |
| 3 | Download: engine queue, resume, live progress, coded failures | a progress bar that moves and a failure you can read | `next-v0.11.0` |
| 4 | The verdict: docs, parity checklist, sign-off, promotion decision | this document's checklist, signed | `next-v1.0.0` |

Each tag is an annotated rollback target. The experiment lane uses the
`next-v` prefix so it can never collide with the `v2.x` production line.

## 3. Sequencing and dependencies

```
shared (codes, types, validation)      ← everything depends on this
  ├── engine: identity → metadata → library → search → downloads
  ├── relay: config → range → cache → resolver → handler
  ├── server: env → db → auth → services → routes → bus
  └── client: session → api → stores → audio → components → pages
```

Rules that kept it always-green:

* **No phase starts before its prerequisite is tagged.** A client page cannot be
  written against a route that does not exist.
* **A milestone is not done until its own tests pass in the same commit**, and
  the workspace pipeline (`turbo run typecheck lint test build`) is green at the
  tag.
* **Verification is a document.** `06-test-report.md` records what was verified
  and — more usefully — what was not.

## 4. Risks and how each was handled

| Risk | Handling | Outcome |
| --- | --- | --- |
| The rewrite silently diverges from production behaviour | the old app stays on `main` and is the reference; each rule is ported with a test naming it | held — see parity checklist §5 |
| Six runtimes multiply failure modes | every service is optional with a documented fallback; a service failure must cost reliability, not availability | held — relay-down and engine-down paths are tested |
| The DCCNN contract drifts between languages | one registry in `packages/shared`, exported to JSON, drift checked in CI | held |
| A download can lose staged bytes on failure | staging is per job and persists; resumability is read from disk | held — tested with a real subprocess |
| The experiment blocks production | separate CI lane, separate tag prefix, nothing imports into `web/`/`api/` | held |
| Docker builds cannot be verified locally | stated honestly; images build for the first time in CI | **open** — see §6 |
| Hidden cross-test state hides real bugs | tests are hermetic (own data dir per test) | **it happened** — found and fixed twice (§6) |

## 5. Parity checklist (Phase 8 gate)

Each row must be demonstrated side by side against `v2.22.1` before promotion.

| # | Behaviour | New stack | Verified by |
| --- | --- | --- | --- |
| 1 | Browse the library (tracks, artists, albums) | ✅ | engine library tests + `GET /api/library/*` |
| 2 | Search: library and YouTube, with `isDownloaded` trustworthy | ✅ | engine search tests, identity map |
| 3 | Play a track — remote first bytes under a second | ✅ | two-tier stream tests, relay range tests |
| 4 | Seek within a track (206 + `Content-Range`) | ✅ | engine `/local` range tests, relay range tests |
| 5 | Play a downloaded track from disk with no network | ✅ | `/local/{id}` tests |
| 6 | Download a track; progress, speed and ETA move | ✅ | `test_downloads.py` progress parsing |
| 7 | A failed download keeps its staged bytes and can resume | ✅ | resume test (4 + 4 = 8 bytes, not a restart) |
| 8 | A failure is readable: code + the engine's own words | ✅ | downloads store toast tests, DCCNN registry |
| 9 | Likes follow the account | ✅ | account integration suite (Postgres) |
| 10 | Preferences follow the account | ✅ | preferences whitelist tests + integration |
| 11 | Play history records once and lists once | ✅ | history integration tests |
| 12 | Playlists: create, add, remove, reorder, ownership | ✅ | playlist integration tests |
| 13 | Artist follows | ✅ | follows integration tests |
| 14 | Lyrics with a tap-to-seek timeline | ✅ | lyrics route tests, `parse_synced` tests |
| 15 | Cover art, embedded or sibling file | ✅ | artwork route tests |
| 16 | Every error state has a page and a code | ✅ | error-page tests, error bridge tests |
| 17 | Unknown route → 404 page | ✅ | `app/not-found.tsx` + prerendered `/error/*` |
| 18 | 5xx → the error page, not just a toast | ✅ | `providers.tsx` bridge + api tests |
| 19 | The app installs to the home screen and shows OS media controls | ⚠️ | manifest + Media Session shipped; **install prompt and lock-screen controls need a real device** |
| 20 | Android foreground service keeps downloads alive | ❌ | not ported — PWA replaces the APK; a background download on mobile is a documented open item |
| 21 | Backup export/restore | ❌ | not ported — `backup_service.py` is the migration input (§9 of the spec) |
| 22 | Listening stats | ✅ | `topTracks` integration test + stats page |

**Verdict rule:** promotion (`apps/*` becomes the product, `web/` + `api/`
deleted) requires every ✅ row demonstrated on a real device *and* rows 19–21
resolved or explicitly accepted by you. Until then the experiment stays an
experiment, and `web/` + `api/` stay shipping.

## 6. Corrections made during implementation

Recorded because a plan that pretends it was right is useless next time.

1. **ADR-8 replaced "BullMQ in `services/node`".** The work can only run where
   `yt-dlp` is, so a Node worker would have existed to ask Python to do it. The
   queue moved into the engine; SSE stayed where authentication lives.
2. **ADR-9 deferred Redis.** It is in compose and documented; one process has no
   fan-out problem, and an unused dependency is a liability.
3. **`services/metadata.py` needed a RIFF writer.** WAV keeps tags in a chunk,
   not a bare ID3 block — a test caught the difference.
4. **`identity` needed a lazy schema.** A read must never be the reason the
   table is missing; a test process that never ran the boot hook failed.
5. **Jobs must capture their data directory at creation.** The tests found this:
   a job that re-resolved `ENGINE_DATA_DIR` at each step could stage in one
   directory and finalise in another. In production the environment never
   changes mid-process — which is exactly why it would have shipped silently.
6. **The library cache must be keyed by its root.** Same class of bug: a cached
   listing is only true of one directory.
7. **Docker image builds remain unverified locally** (no daemon on the dev
   host). They build for the first time in CI; that gap is stated in the tag
   message rather than glossed.
8. **`go test -race` cannot run on the dev host** (ThreadSanitizer rejects the
   Termux VMA range). Plain `go test` passes; CI runs it with `-race`.

## 7. Rollback

| Want to undo | Do this |
| --- | --- |
| One milestone | `git checkout next-vX.Y.(Z-1)` — each tag is a complete, green state |
| The whole experiment | stay on `main` (v2.22.1): nothing in `web/` or `api/` was touched |
| A schema change | `apps/server/drizzle/` holds reviewable SQL; revert the migration and the code together |
| A download's staging | the job's staging directory under the engine's data dir; `DELETE` a running job and it is deliberately kept |
