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

## M1 — Play (complete · `next-v0.9.0`)

| Tag | Slice | Deliverable | Proof |
| --- | --- | --- | --- |
| `next-v0.9.0` | library + playback | Engine grows library scan, tag reading, the identity table, `yt-dlp` search and lyrics; the server gains `/api/library/*`, `/api/search`, `/api/lyrics`, `/api/tracks/:id`; the client gets the API layer with coded errors, the toast system (pass/fail/code/ⓘ), the player and queue stores, the IndexedDB byte cache, the opt-in Web Audio graph, `PlayerBar`, the app shell, home/search/library/downloads/settings/stats pages and the PWA manifest | **118** engine tests · **62** server (10 DB-gated skipped) · **71** client · **14** shared · **20** relay · 12/12 turbo tasks · production build |

### Decisions made during the playback slice

| Decision | Why |
| --- | --- |
| The **error bridge** lives in one provider | A 5xx is not something a toast can fix, so `onPageError` navigates to `/error/{status}` with the DCCNN code. 404 and 429 deliberately do not navigate: a missing track is not a reason to take the screen away |
| The queue never lists the playing track twice | The current track is the queue's first entry, not a copy of it. The client test that caught the duplicate is now the regression guard |
| Favourites are a store, not local state | The same track is drawn by the library, a search result and the player bar; a heart that only flips where it was clicked is why people click twice |
| Optimistic like with a coded rollback | The heart moves immediately because that is what the user meant, and reverts with `TEX01` if the server disagrees — a silent revert is worse than a delay |
| `GET /api/tracks/:id` exists | Playlists, history rows and deep links hold an id and nothing else; without it, opening a playlist means reading the whole (paginated) library, where a track past the page would look deleted |

## M2 — Sign in (complete · `next-v0.10.0`)

Done when **likes and settings follow you in**: accounts, preferences, liked
songs, history, follows and playlists are server-owned and per-user.

| Tag | Slice | Deliverable | Proof |
| --- | --- | --- | --- |
| `next-v0.10.0` | accounts + auth surface | Drizzle schema for users, preferences, likes, history, follows, playlists; `account.service` / `preferences.service` / `session.service`; the `/api/me/*` route family with likes and history before the parameter routes; the client mounts `ClerkProvider` + the session bridge + `clerkMiddleware` **only when a publishable key exists**, with `/sign-in` and an account control in Settings | 72 server tests (incl. 10 against Postgres in CI) · provider swap unit-tested · `ClerkProvider` never rendered without a key |

### Decisions made during the sign-in slice

| Decision | Why |
| --- | --- |
| No server-side sign-in route, ever | A route that mints a session from a user id is an account-takeover primitive. Clerk's hosted components collect the credential; the API only verifies a token |
| The client's session layer is an **interface with two mounts** | `devSession` (allow-listed dev header) and Clerk's `useAuth` are the same `Session` object to every caller, so no store or route knows which one is live — and the app still boots with no keys |
| Middleware degrades instead of failing | Clerk's middleware throws without a key; a construction failure falls back to pass-through, which is safe because middleware is convenience, not the security boundary — every data route checks the session itself |
| Static preference paths register first | `/api/me/preferences/defaults` and `/api/me/likes/count` must never be swallowed by a parameter route. Same ordering rule the track router has carried since the current stack |

## M3 — Download (complete · `next-v0.11.0`)

Done when **a progress bar moves and a failure is readable**: the engine owns the
queue, the server owns ownership, the client shows both.

| Tag | Slice | Deliverable | Proof |
| --- | --- | --- | --- |
| `next-v0.11.0` | queue + progress + failures | Engine download manager (subprocess, progress regex with speed and ETA, per-job staging, resume read from disk, tagging, identity recording, library invalidation); owner-scoped server routes; SSE progress; the downloads page and the fail toast carrying the engine's own words plus its DCCNN code | download tests drive a **real subprocess**: success, refusal, staged bytes, 4+4 byte resume, fresh retry, owner scoping, duplicate refusal, queue ceiling |

### Decisions made during the download slice

| Decision | Why |
| --- | --- |
| `resume` is tri-state | `undefined` (continue if staged bytes exist) is not `false` (throw them away). Collapsing them loses the user's bytes or their intent |
| The owner comes from the session header, never the body | A client that can name an owner can name someone else's. The engine scopes every read and mutation by the header the server attaches |
| Another user's job answers `DNF01` | "Not found", never "forbidden", so the response does not confirm that the job exists |
| A job snapshot is read under one lock | The status and `active` flag are derived from a single read; the previous two-read version could answer `running` + `active: false` (see `06-test-report.md` §3.7) |

## M4 — The verdict (documentation complete · `next-v0.12.0`)

| Tag | Slice | Deliverable |
| --- | --- | --- |
| `next-v0.12.0` | docs + seam + verdict | Redis-backed realtime fan-out with a documented fallback (the last reserved seam, now live), the reserved search slot documented rather than implied, Phase 8 sign-off, and the honest list of what only a human audit can close |

`next-v1.0.0` is deliberately **not** tagged here. It is the promotion tag, and
it means "a human ran the workspace gates, the compose stack and a device test
and agrees with this document". Tagging it from inside the implementation would
make the tag mean "the author says so", which is exactly the claim a sign-off
is supposed to be independent of.

## M3.1 — Live extraction (complete · `next-v0.13.0`)

Done when **a real track downloads from real YouTube and plays from real CDN
bytes**. This slice exists because every test up to `next-v0.12.0` drove a stub
`yt-dlp`: the pipeline was proven, the extraction ladder was not, and the
original report was a download failing in the user's hands.

The run was done against the live services — engine on a temp data directory,
relay in front of it, real `yt-dlp 2026.08.19` and `ffmpeg` present. It found
two defects, both of which a stub could never have produced.

| Tag | Slice | Deliverable | Proof |
| --- | --- | --- | --- |
| `next-v0.13.0` | live extraction | the range-gating fix in **both** byte paths (Go relay and the server's direct tier), re-mint-on-refusal with a cache-bypassing re-resolve (`?fresh=1`), and a network-gated live test suite | a real track downloads end to end, and the relay answers a no-`Range` request with the whole file instead of `502 upstream_status_403` (see `06-test-report.md` §2.4) |

### Decisions made during the live slice

| Decision | Why |
| --- | --- |
| A client that sends no `Range` still gets one | CDN audio URLs are **range-gated**: an unbounded request stalls until the client gives up, while `bytes=0-` answers with the entire file in one 206. A player that opens a track without asking for bytes (Safari does) was failing on a URL that works |
| A full-span 206 is presented as a 200 | The client asked for nothing, so a 206 it never requested makes some players wait for a second range. A *capped* 206 passes through untouched — calling a truncated body complete would be a silent lie about the length |
| A refusal is retried with a **fresh** resolve, not the same one | The resolved URL is the problem, not the moment, so a blind retry re-fetches the URL that just failed. The engine caches direct URLs for hours, so "re-mint" means re-resolution — without `?fresh=1` the retry is a no-op that looks like a retry |
| The live tests are skipped unless `RHEOSON_LIVE=1` | They talk to YouTube, move megabytes and take ~15 s. Keeping them in the default suite would make CI honest about the wrong thing: a stub is what a hermetic suite needs, and the live suite is what a *release* needs |
| The live test asserts a container, not a title | It checks the opening bytes are ISO base media (`ftyp`), never a specific video's metadata. A re-uploaded video is not a regression, and a test that says it is would be deleted the first time it cried wolf |

## M4 — Spotify import (complete · `next-v0.14.0`)

Done when **a Spotify share link — track, album, playlist or artist — resolves
to playable, downloadable tracks**. The engine grew a `spotify` service and two
routes; the server grew a validating proxy; the search page grew an import flow.

### Where the metadata comes from

`open.spotify.com/embed/<kind>/<id>` — measured live, no credentials:

| Kind | Payload | Notes |
| --- | --- | --- |
| `track` | name, artists[], duration, release date, cover (`visualIdentity.image[]`), 30 s preview | preview is **not** used — Rheoson plays YouTube audio |
| `album` | + full `trackList` | every track with its `spotify:track:` URI |
| `playlist` | + first **50** `trackList` rows | unplayable (market-restricted) rows are skipped |
| `artist` | + **top 10** `trackList` rows | the embed payload's own cap |

The anonymous token endpoint is blocked (403) — and irrelevant, because
Rheoson never plays Spotify audio. A share link is *identity*, not bytes.

### Decisions made during the Spotify slice

| Decision | Why |
| --- | --- |
| Match on YouTube **lazily, per track, cached forever** in `.spotify_map.sqlite` | A matched recording is a fact, not a trend. Re-importing a playlist costs zero searches; a 50-track playlist spends exactly 50 one-result searches, once |
| Matching runs in **chunks of 10 from the client** | One 50-track call would risk one long all-or-nothing timeout. Ten chunks surface progress and a partial success is a success |
| The same DCCNN codes are reused (`RVA02` unsupported, `RUP01` upstream, `RNF01` no match, `PUP01` no playable tracks, `DEN02` no tool) | No new codes were needed; the search domain already owned every failure this feature can produce. Registry churn across two languages was not justified |
| An unmatched track renders, flagged, with `matchError` | Hiding it would lie about the playlist's contents. `RNF01` ("no lyrics/match found") is the honest answer, and the row offers a retry |
| `isDownloaded` is re-annotated from the identity map at answer time | A matched track that is already on disk must not present itself as stream-only |
| The server proxies with validation, the engine does the work | Rows reach a subprocess's neighbourhood, so ids are length-bounded and titles trimmed server-side; the URL is length-capped and encoded once |

### Surfaces

| Layer | File | What |
| --- | --- | --- |
| engine | `apps/services/py/app/services/spotify.py` | parsing, embed resolution, matcher, cache |
| engine | `/spotify/resolve`, `/spotify/match` | the two routes, `match=false` skips YouTube |
| server | `spotify.service.ts` + `spotify.routes.ts` | validation, cleaning, translation |
| client | `lib/spotifyLink.ts`, search page import flow | paste → metadata → progressive match → play |
