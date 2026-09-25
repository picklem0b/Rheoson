# Roadmap — Milestone 2.20

Milestone 2.19 made playback and downloads work on a bare host. Milestone 2.20
is about the **failure surface**: what the product says, and stops saying, when
something upstream breaks.

The trigger was a real report — a download failing with *"YouTube refused this
track on every client we tried"* on a host whose `yt-dlp` was already the newest
release. The engine was current, the track was fine, and the sentence was false
on both counts. Tracing it found six defects behind that one message, none of
them about `yt-dlp`: the failure was misattributed, progress was never reported,
and the sentence explaining it was truncated on every surface that could have
shown it. A product that cannot explain its own failures cannot be operated,
and this milestone treats that as a defect class rather than a copy problem.

Phases ship one per commit and are annotated-tagged `v2.20.N`, per
`GIT_WORKFLOW.md`.

---

## v2.20.0 — Download and failure-surface correctness

**Progress that is reported.** `yt-dlp` writes progress to *stdout* and
diagnostics to *stderr*. The download read only stderr **and** passed `--quiet`,
which suppresses the progress lines outright — two independent causes with one
symptom, so every download sat at 0% until it finished. Both pipes are now
drained concurrently and progress is parsed from the stream that carries it.

**Failures that say what happened.** `_friendly_download_error` had a single
extractor branch, so a transient CDN 403, a bot check, a deleted video and a
genuinely refused track all produced the same sentence — one that advised
updating an engine already at the latest release. There are now four branches,
each naming the action that actually helps.

**A message the user can read.** The activity pill clipped the error at 240px
and the Downloads row clipped it again, so no surface showed the full sentence —
including the action at its end. Both wrap now, the pill carries the message in
its `title` and leads to Downloads, where retry lives.

**A failure that stays dismissed.** Failed jobs persist so the Downloads list
stays a durable record, but the pill re-announced an older failure on every
launch and had no dismiss handler. Acknowledgements now persist alongside them,
so a dismissal sticks without deleting the record.

**An update path that can update.** `yt-dlp -U` refuses a pip/wheel install —
`is_non_updateable()` returns *"You installed yt-dlp with pip or using the wheel
from PyPi"* — and on Termux every install is one, so the daily update cron had
never updated anything. It falls back to pip through the interpreter named in
the binary's own shebang, with a PEP 668 retry.

**A ladder without dead rungs.** `ios`, `mweb` and `web` failed on every attempt
against every track measured (6/6) with "Requested format is not available",
because those clients now answer with SABR formats that no `-f` selector can
pick. Each one cost a subprocess spawn and a full extraction while never
producing a format.

**Health that does not lie.** `/api/health` reported `services.redis` as
`bool(REDIS_URL)` — a string check — while no module imported a Redis client, so
setting the variable asserted a working cache that did not exist. Configuration
and reachability are now separate, reachability from a bounded PING that never
echoes the URL: a Redis URL carries its password in the authority, and health is
served unauthenticated.

**A schema codegen can consume.** `api_route(methods=["GET", "HEAD"], …)` emits
one operationId per registered route, so `stream_audio` and `health_api_health`
each appeared twice and the generated schema broke OpenAPI's uniqueness rule.

**Deployment that serves what it claims.** The Search Console verification file
sat at the repository root, outside `web/public/` — the only directory Vite
copies into the build — so it was never in `dist/` and the verification could
not have succeeded.

- Seven silent dual-store fallbacks (liked count, history clear, playlist
  mirror and delete, profile hydrate) now trace the primary-path failure at
debug level. They still fall back.

---

## Milestone 2.19 — reliability arc (complete)

Milestone 2.18 rebuilt the presentation layer. Milestone 2.19 is about the
things a user actually notices when they break: **playback and downloads that
work, an auth boundary that is honest, and library state that is
instantaneous.** It also folds in the API code review findings rather than
shipping them as an untracked patch line.

Phases ship one per commit and are annotated-tagged `v2.19.N`, per
`GIT_WORKFLOW.md`. Shipped: **v2.19.1** (playback/download reliability),
**v2.19.2** (auth and API trust boundary), **v2.19.3** (username identity),
**v2.19.4** (instant state), **v2.19.5** (browse and discovery),
**v2.19.6** (library information architecture), **v2.19.7** (creator
surfaces) and **v2.19.8** (close-out). Milestone complete.

---

## v2.19.1 — Playback & download reliability

The toolchain behind playback is the single highest-impact defect: audio
extraction and the transcoding fallback both require `ffmpeg`, and a host
without it fails every download and every fallback stream with a raw
subprocess error.

- `app/core/toolchain.py` — one source of truth for locating `yt-dlp` and
  `ffmpeg` (env override → `PATH` → Termux `$PREFIX/bin` → common system
  dirs), cached per process, with a resolution report for diagnostics.
- Guarantee `ffmpeg` availability: `--ffmpeg-location` is passed to every
  yt-dlp invocation that post-processes audio, and the Doctor gains a
  one-tap "install ffmpeg" repair on Termux.
- Downloads degrade instead of dying: when no `ffmpeg` can be found, the job
  takes the raw `bestaudio` container (`m4a`, already a supported library
  extension) instead of running `-x` and failing.
- Streaming stops depending on `ffmpeg` for the fallback path: the transcoder
  is used when present, otherwise the raw container is relayed to the player.
- yt-dlp is refreshed through the resolved binary, and the client/format
  fallback ladders report which client succeeded.
- Failure copy becomes user-safe: raw subprocess tails and video ids never
  reach the UI.

## v2.19.2 — Auth and API trust boundary

Closes the API review findings (`CRITICAL-1`, `HIGH-1..3`, `MEDIUM-1..4`):

- Login verifies the password; session creation is no longer reachable by
  knowing an email address.
- Download jobs carry an owner and are scoped to it; no anonymous control of
  another user's jobs.
- Destructive Doctor operations are admin-only, matching the other
  maintenance routes.
- Environment validation fails closed on an unrecognised `ENV`.
- Clerk JWT issuer matching is exact rather than substring; webhook replay is
  de-duplicated; job persistence is atomic.

## v2.19.3 — Account contract (shipped)

- Identity is a single **username**: no first name, no last name, anywhere.
  Stored on the user document, returned by `/auth/me`, editable through
  `PATCH /auth/me`, and validated server-side (`3–32` chars of
  `A–Z a–z 0–9 _ .`) because it becomes a messaging handle.
- **Email or phone** — either is sufficient, neither is a sign-up error — plus
  a **password of at least 8 characters**.
- Clerk instance configuration this maps to (Dashboard → User & Authentication):
  identifier set to *Email address* **and** *Phone number* (both required as
  attributes, either acceptable as identifier), *Username* required and unique,
  password minimum length 8. There is no credential form in our code — sign-in
  is Clerk's, for the reason recorded in v2.19.2.
- NIST SP 800-63B recommends 15 characters for single-factor authentication;
  8 is the configured minimum, and 15 is the stronger choice if MFA is off.

## v2.19.4 — Instant state (shipped)

Nothing the user already knows should require a network round trip to
reappear.

- One query-key registry plus surface-wide invalidation helpers: a like
  refreshes the count, the liked list, library rows, history and shelves
  wherever they are mounted; playlists, follows and plays do the same for
  theirs. Same-account pages stay in step without a reload.
- A whitelisted localStorage snapshot restores the small account summaries
  (like count, playlists, recently-played, following) immediately on a return
  visit. Per-account, wiped on sign-out, ignored past 24 hours, and always
  revalidated.
- Settings persistence was audited: sections already write through
  `usePersisted` / their Zustand stores, so an edit survives navigating away
  and back.

## v2.19.5 — Browse and discovery (shipped)

- Category tiles are a proper browse target — 124px (140px from `sm`), with a
  readable genre label and chevron. Moderate, not full-screen.
- A category chart shows ten tracks, laid out like the library rather than
  squeezed into a card.
- Implementation copy under each heading is gone; the same explanation lives
  behind a new `InfoTooltip` info affordance.
- Album, artist and playlist pages confirmed as complete routed destinations.

## v2.19.6 — Library information architecture (shipped)

- Liked songs, playlists and the rest are stacked sections with real headings
  and hairline section rules, instead of a row of tabs above the content.
- Zero-state counts render immediately from the persisted cache.
- All four sections query through the shared key registry, so a like or a
  playlist change refreshes the library like every other surface.

## v2.19.7 — Creator surfaces (shipped)

- The creator tab becomes a professional artist destination: identity header
  with reach, a Popular chart, a horizontal discography, and a route into the
  full artist page — no placeholder scaffolding.
- Lyrics live only in the Lyrics tab; the creator tab carries identity and
  songs rather than a second copy of the same words.
- Follow state is optimistic and invalidates the shared follow surfaces, so a
  follow here is reflected in the following list and artist page immediately.

## v2.19.8 — Close-out (shipped)

- The like-invalidation contract now covers every surface that renders a track
  row — album, artist, artist-content, trending, category charts and open
  playlists — not just the count and the library.
- The album like button reads the shared liked set and follows a like made
  anywhere, instead of a single IndexedDB read on mount.
- `InfoTooltip` is a disclosure, not a hover tooltip; its panel no longer
  carries the wrong ARIA role.
- Feature status, roadmap, changelog and README brought current with the 2.19
  line. Focus is a single app-wide ring and motion honours the OS setting, so
  the new surfaces inherit both rather than re-declaring them.

## v2.19.9 – v2.19.13 — Verified-media and user-safety hardening (shipped)

- A real end-to-end download through the app's own pipeline surfaced and fixed
  the two defects that made downloads "just not work": a structlog keyword
  collision that killed the job on its first emit, and a missing tag writer.
- The streaming fallback was exercised end to end; its response type is now
  sniffed from the bytes rather than predicted, and the path deliberately
  relays the native audio instead of pretending to transcode.
- Every remaining path that could put raw extractor, URL or OS text on screen
  is mapped to user-safe copy, with tests pinning the contract.
- Playlist authoring is one flow: name-only creation, an add-songs sheet with
  suggestions and search, and an empty state that leads somewhere.

---

**Guardrails for every phase:** `tsc`, `eslint`, the full vitest and pytest
suites, a production build and the API-base check all pass before the commit;
existing settings, themes and preference sync keep working; the APK still
builds. No phase merges into another — a finished, tested phase is tagged.
