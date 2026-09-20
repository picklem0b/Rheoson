# Roadmap — Milestone 2.19

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

---

**Guardrails for every phase:** `tsc`, `eslint`, the full vitest and pytest
suites, a production build and the API-base check all pass before the commit;
existing settings, themes and preference sync keep working; the APK still
builds. No phase merges into another — a finished, tested phase is tagged.
