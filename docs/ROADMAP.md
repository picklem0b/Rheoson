# Roadmap — Milestone 2.19

Milestone 2.18 rebuilt the presentation layer. Milestone 2.19 is about the
things a user actually notices when they break: **playback and downloads that
work, an auth boundary that is honest, and library state that is
instantaneous.** It also folds in the API code review findings rather than
shipping them as an untracked patch line.

Phases ship one per commit and are annotated-tagged `v2.19.N`, per
`GIT_WORKFLOW.md`. Shipped: **v2.19.1** (playback/download reliability) and
**v2.19.2** (auth and API trust boundary).

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

## v2.19.3 — Account creation contract

- Fields: **username** (reserved for the future realtime messaging identity),
  **email and phone number** (either one is sufficient, but a request missing
  both fails with a clear field error), and **password** of eight characters
  or more.
- Because sign-in is Clerk's (no credential proxy — see v2.19.2), this phase
  configures and documents the Clerk instance to match: identifier set to
  email *and* phone with username required, and a minimum password length of
  eight. A first-party credential form is only worth building if the product
  decides to own auth end to end, and it would need a real credential store.
- Username is unique and immutable-by-default; it becomes the display name
  and the messaging handle.

## v2.19.4 — Instant state

Nothing the user already knows should require a network round trip to
reappear.

- Server-derived counts (likes, playlists, history) are persisted locally and
  rendered immediately on return visits; the fresh value replaces it when it
  arrives.
- Settings changes persist and are visible from every page, not only inside
  Settings.
- A change to one surface updates that surface live (single-track broadcast),
  without reloading the page or the whole app.
- Skeletal loading is only ever shown for data that has never been seen.

## v2.19.5 — Browse and discovery

- Category profiles become full-width feature surfaces rather than small
  cards, with a dedicated songs view per category.
- Album, artist and playlist pages are complete destinations of their own.
- Meta copy that describes the implementation ("refreshed weekly and cached
  on the server") is removed; explanatory hints move behind an info affordance.

## v2.19.6 — Library information architecture

- Liked songs, playlists and the rest become stacked sections with real
  headings and hairline section rules, instead of a row of tabs above the
  content.
- Zero-state counts render immediately from the persisted cache.

## v2.19.7 — Creator surfaces

- The creator tab becomes a professional artist destination: identity header,
  verified discography, and lyrics, with no placeholder scaffolding.

## v2.19.8 — Close-out

- Motion, focus, and contrast verification across the new surfaces.
- Documentation, changelog and status tables brought current; Lighthouse pass.

---

**Guardrails for every phase:** `tsc`, `eslint`, the full vitest and pytest
suites, a production build and the API-base check all pass before the commit;
existing settings, themes and preference sync keep working; the APK still
builds. No phase merges into another — a finished, tested phase is tagged.
