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

## v2.20.1 — Transient refusal recovery

**A refused transfer is retried, not answered with another client.**
`unable to download video data: HTTP Error 403` means extraction *succeeded* and
the CDN then refused the bytes — typically a signature that expired or is bound
to the IP it was minted for. It was also listed in `_EXTRACTOR_FAILURE_MARKERS`,
so the ladder read the one failure a retry fixes as a reason to switch player
client: it spent every rung and only then reported *"refused this track on every
client we tried"*. Nothing anywhere retried. Measured on a track failing this
way, an immediate re-run succeeded 5/5 — re-running re-extracts, which mints a
fresh URL, which is the actual remedy.

The ladder now checks a refused transfer first and retries the **same** client
with a bounded backoff (two tries, 1s then 3s) before any client switch, so the
worst case stays bounded and a cancelled job still aborts between attempts.

**One marker list, not two.** `download_service` carried its own
`_MEDIA_REFUSED_MARKERS` alongside `stream_service._EXTRACTOR_FAILURE_MARKERS` —
the same four strings in two places, disagreeing about what `http error 403`
means. The list now lives once, in `stream_service`, beside
`is_transient_media_refusal()`, with a test pinning the deliberate overlap so
the ordering that resolves it cannot silently become dead code.

---

## v2.20.2 — A test run that tells the truth

**Zero warnings.** On Python 3.14 the suite emitted 17,909 warnings — every
one from third-party code calling `asyncio` APIs deprecated in 3.14
(`pytest-asyncio` 0.23 drove the loop through `get/set_event_loop_policy`; FastAPI and
Starlette called `asyncio.iscoroutinefunction`). Nothing came from `app/` or
`tests/`, and Python 3.16 will remove the calls outright. Upgraded
`pytest-asyncio` 0.23.7 → 1.4.0 (needs pytest ≥ 8.4, so pytest 8.2.2 → 9.1.1)
and FastAPI 0.111 → 0.141 / Starlette 0.37 → 1.7, whose floors stopped calling
the deprecated APIs. The suite now prints **343 passed** and nothing else.

**A guard rail that had gone blind.** The upgrade failed
`test_route_count_sane_and_health_exported`, and for a good reason: FastAPI
0.141 no longer flattens `include_router` children into `app.routes` — it adds
a lazy wrapper holding the handlers and the mount prefix. The endpoint
inventory's `_routes()` filtered `app.routes` for `APIRoute` instances and had
been iterating **13 of the 108 registered routes**, so `test_openapi_covers_registered_routes`,
`test_every_mutating_route_requires_auth` and `test_public_get_routes_never_500`
were passing while checking almost nothing. `_routes()` now walks the wrappers
(`original_router` + `include_context.prefix`), re-attaches the effective path,
and the auth/OpenAPI guards see the full surface again.

---

## v2.20.3 — DCCNN error codes

**A code on every failure.** Users reporting a problem now have something to
quote: `Download failed [ERR DEX01]`. Codes are five characters — domain
letter, two-letter category, two-digit sequence — so the code itself carries
meaning: D=downloads, A=auth, P=playlists…; VA=validation, NF=not-found,
EX=execution failed. One registry owns every code (`app/core/error_codes.py`),
`fail()` refuses to raise an unregistered code, and a contract test pins
uniqueness, domain-letter consistency, DCCNN shape and the sync of
`docs/ERROR_CODES.md`. Every `HTTPException` in the routers now goes through
the registry, and the response handler emits a structured `code` field so the
frontend never parses it out of the message text.The download failure path attaches its registry code to the job's error message.

---

## v2.20.4 — One error surface, everywhere

**An error page that is an app surface, not a browser default.** Unknown routes
(404), failed API calls routed through `/error`, auth guards and React render
crashes all land on the same `ErrorPage`: an "ERROR PAGE" eyebrow, the big
code, the short label, and an ⓘ control. The long explanation is never shown
by default — tapping ⓘ opens an accessible panel with the error-specific title
and subtitle (404 → "Not Found / We couldn't find the page you're looking
for.", 401 → "Sign in first", 503 → "We'll be back shortly", and so on). The
config is data-driven (`lib/errorPages.ts`): adding a status is an entry, not
a component. Mouse, keyboard and touch all work — the ⓘ is a real button with
`aria-expanded`/`aria-controls`, Escape closes, focus returns to the control
that opened the panel. Unknown error codes render the 500-shaped fallback.

**The ErrorBoundary stopped having its own visual style.** It used to render a
private card with its own icon, buttons and typography — a second, worse error
design. It now renders the same `ErrorPage` (500-shaped — a render crash *is*
"something broke"), with the underlying exception message behind ⓘ. Because
the boundary mounts above the router, `ErrorPage` is purely presentational and
the router-aware action row is a separate export used by the routed wrappers.

**Toasts that carry the code.** Toasts gained success (green, check) and error
(red, cross) variants — downloads announce "Download complete — “Title”" in
green and failures in red — plus a code chip and an ⓘ control that expands to
the full untruncated message. The API client's `ApiError` now carries the
backend's DCCNN code as a field, parsed from the structured `code` the backend
emits with a suffix fallback for older servers, so the UI never has to regex a
code out of a sentence.

**A test run that stops lying about coverage.** Full-suite runs on Termux
flaked: Vitest's default pool fans out across fork workers, and parallel
jsdom+React imports outran the worker startup timeout — a worker died, its
file silently vanished from the run, and the suite reported "passed" over
fewer files than exist (observed: 14 files → 13 → 12 across consecutive runs
with zero test failures). The pool is now pinned to one worker: the run is
deterministic at **15 files / 141 tests**, every file every time.

---

## v2.20.5 — Server failures take the page

**An unhandled 5xx now navigates to the error page instead of evaporating in a
toast.** The API client funnels every call, so it is the one place that can
route a server failure to the `/error` surface built in v2.20.4: the failure's
status, message and DCCNN code travel in router state, the navigation replaces
(not pushes — the failed screen is not a destination), and repeated failures
collapse into one navigation. The error page's ⓘ panel now also renders the
`[ERR …]` chip.

**Failures that are somebody's job stay somebody's job.** Gateway-class
responses (502/503/504) get one silent retry after 1.5 s before anything is
declared fatal — Render free-tier instances wake slowly, and one probe round
absorbs most of them. Probe callers opt out entirely via `_noFatalRedirect`:
the health endpoints and the Doctor present a failing backend as findings
(that is their whole purpose), the version poller is background best-effort,
and download failures stay in the Downloads list where retry lives — the same
reason v2.20.0 kept failed job records durable. Status 0 (unreachable) still
belongs to the NetworkErrorBanner, whose polling makes recovery visible.

---

## v2.21.2 — The library answers back

A library-wide search field filters favourites, playlists, albums and
artists live, and a section with no matches says so instead of sitting
silent. Empty sections render their message the moment data lands
rather than loading forever. Playlists render as thumbnail cards with
provenance — created by the signed-in user on the date, 22 sep format —
in a horizontal scroller with a nudge button, and the artist skeleton
is circular to match what it becomes.

---

## v2.21.1 — The player tells the truth about speed, source and favourites

The playback surface caught up with its own engine. The ••• menu's
playback settings became a real sheet: speed (0.75× to 2×, persisted,
applied to the live Howl and re-applied on every load), repeat, shuffle
and a playthrough choice — keep going when the queue ends, or stop. The
full player's header now says **Playing from …** instead of the static
"Now Playing" label, derived once at play time from wherever the track
was started (search, trending, a playlist, an album, an artist). The
fake drag handle is gone; a working dismissal path (back, chevron) was
already there. The buffering spinner became the app's EQ motif, and the
queue no longer lists the playing song twice — history's last entry IS
the current track, and the queue tab now dedupes on id. Lyrics warm the
cache on mount, so the Lyrics tab never opens cold. Like became
**Favourite** across the player, context menu, album page, downloads
rows, profile stat and library section.

---

## v2.21.0 — The home page picks a lane

Home carried eight stacked surfaces; a listener had to parse them all.
It now renders four, each answering one question: **Last played** as a
plain list, **Recommended artists** derived from the thirty-day
listening profile (circular cards, resolved through search so every
tap routes to the artist page), **Trending this week** as five rows
that expand to ten in place with a See all route to the full chart,
and **Made for you** as a grid of daily-mix playlist cards. The hero,
quick-pick tiles, featured carousel and recommendation rails retired.

---

## v2.20.9 — The preview toast fails honestly

The mini preview only ever showed the happy path. Its downloads tab
now carries the app's red failure toast with the [ERR DEX01] chip and
an accessible ⓘ toggle that expands the full plain-language message,
so the site demonstrates the promise the product makes about errors.

---

## v2.20.8 — The preview shows the receipts

The landing page's phone preview demonstrated streaming but never the
feature this project is named for: downloads. The preview gains a fourth
tab, **Downloads**, showing the completed state — three tracks with the
logo placeholder art, format and duration lines, and green check chips —
plus the app's signature green **"Download complete"** toast floating
above the player bar, exactly as the real app announces a finished job.
The bottom dock was decorative; every dock item now switches tabs too,
mirroring the tab strip like the real nav would.

---

## v2.20.7 — The preview wears the real mark

The landing page's mini app preview showed gradient tiles with a single
letter standing in for album art. The real app never does that — its
placeholder for missing artwork is the Rheoson logo itself. The preview now
uses the actual logo asset (copied to `docs/assets/` so Pages serves it
without touching `web/`), framed like the app's placeholder tiles: rounded,
hairline border, cover-fit. Same fix across all eleven tiles on the Home,
Search and Library tabs.

---

## v2.20.6 — The website, findable

**Google had never heard of us.** A site search returned zero results — not
low ranking, *absent*. The cause was structural: the repo had no robots.txt,
no sitemap, no canonical URL, no og:url, no structured data, and a bare
`<title>Rheoson</title>` that gave crawlers one word to work with. The
verification file deployed in v2.20.0 only proves ownership to Search
Console; nothing since told any crawler the site exists or what it is.

The whole discovery layer now ships:

- **robots.txt** — public routes crawlable; session/personal surfaces
  (settings, profile, stats, wrapped, auth) disallowed; sitemap declared.
- **sitemap.xml** — the SPA's public routes with priorities that reflect
  reality (home 1.0, landing 0.7, session-gated app pages low).
- **Head overhaul** — descriptive title and meta description, keywords,
  canonical URL, `og:url`/`og:site_name`/`og:image:alt`, Twitter summary
  card, `robots` meta, and JSON-LD `WebApplication` structured data so the
  results page can render what the product is.
- **Per-route head updates** (`lib/seo.ts`) — every navigation rewrites
  title/canonical/og:url ("Search — Rheoson", "Your Library — Rheoson", …),
  wired via the router's subscription so no page imports anything; deep
  links are covered by an immediate first call. Six tests pin the mapping
  and idempotency.

Honest expectation: this makes the site *crawlable and describable*, which
is the precondition for ranking — not ranking itself. Indexing a new domain
takes days-to-weeks after Search Console sees the sitemap, and a one-page
SPA with no public catalog has thin content to rank. The follow-up that
actually earns traffic is public, signed-out catalog pages (artists,
albums) — that is when this layer starts paying.

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
