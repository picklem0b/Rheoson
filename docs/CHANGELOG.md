# Changelog

All notable changes to Rheoson are documented here.

Format: `v(major).(minor).(patch)[-rc]` — **annotated** tags (`git tag -a`), pushed with `--follow-tags`. The tag message is the release summary; the four synced version files (`api/pyproject.toml`, `web/package.json`, `web/src/lib/constants.ts`, `api/app/main.py`) carry the `APP_VERSION`.

---

## v2.18.4

Redesign phase 4/7 — the player surfaces.

- fix(player): **PlayerBar works in light theme.** The card was a hard-coded dark gradient with a raw crimson glow; it now renders the shared glass material (theme-aware, solid fallback under `prefers-reduced-transparency`) with token-driven elevation, and the playing-state glow is expressed through `--accent-subtle` instead of a hard-coded rgba literal.
- feat(nowplaying): desktop gets a centered player column and a centered segmented tab control. The full-screen backdrop keys off the neutral ramp instead of pure black.
- fix(player): volume icon mapping was inverted between breakpoints (low volume showed the loud speaker); now `SpeakerX` below mute, `SpeakerLow` under half, `SpeakerHigh` above.
- fix(ui): codemod-corrupted menu labels repaired — the overflow and context menus read "Download", not "DownloadSimple".
- feat(a11y): the PlayerBar like button carries an accessible name and a 40px hit area.
- chore(release): version 2.18.4 across all five sync points.

---

## v2.18.3

Redesign phase 3/7 — Home, Search and Library.

- feat(home): token-driven placeholder surfaces replace the multi-hue gradient pools on artwork-less items — a muted Phosphor glyph on `--bg-overlay` instead of eight saturated gradients competing with the accent. Desktop gets a max-width content column; QuickPicks and its skeleton share the same responsive grid so loading and loaded states align pixel-for-pixel.
- feat(search): desktop max-width column, 40px minimum touch targets on history rows and suggestion rows, and the text-corruption sweep across user-facing copy introduced by the Phase 2 icon codemod ("MagnifyingGlass for songs" → "Search for songs").
- feat(library): same placeholder treatment across grid, list and artist views; 1px hairline borders replace 2px on avatars; raw reds replaced with the semantic `--danger` token pair (liked hearts, remove buttons).
- feat(tokens): semantic `--danger-rgb` / `--danger-text` / `--danger-bg` added to the token layer with light-theme re-mapping — status hues stay recognizable regardless of the active accent.
- fix(tests): page-component names restored (`Home`, `Search`, `Library`) after the icon codemod collided with page identifiers.
- chore(release): version 2.18.3 across all five sync points.

---

## v2.18.2

Redesign phase 2/7 — app shells and the icon system.

- feat(shell): **desktop sidebar shell and mobile bottom nav** rebuilt on the Phase 1 token layer. The bottom nav is safe-area padded for notched devices; active states, spacing and icon sizing all come from the semantic token layer. A device-class bridge in RootLayout keeps the APK on the mobile shell even on tablets — a 1280-wide Android tablet renders the phone experience, never a stretched desktop UI.
- feat(motion): route transitions with iOS spring curves; navigation is the only place screens animate — playback controls stay instant.
- refactor(icons): **complete lucide-react → @phosphor-icons/react migration** across every consumer. One family, one stroke weight, applied by a deterministic codemod; `lucide-react` is removed from the dependency tree and the vendor manualChunks now pins the Phosphor chunk.

---

## v2.18.1

Redesign phase 1/7 — the design-token foundation everything else builds on.

- feat(ui): **three-layer token architecture** (primitive → semantic → component) in `index.css`. Themes and surfaces now change at the variable layer only; every existing variable name was preserved so components kept working untouched through the phases that follow.
- feat(type): **Geist Sans + Geist Mono self-hosted** as variable fonts — no render-blocking Google Fonts request. Tabular figures for all durations and timestamps; tightened display tracking.
- feat(theme): single tinted neutral ramp, near-black dark and inverted light with zero pure black/white; all seven accents recalibrated below the 80% saturation line; tinted diffuse shadows; WCAG AA contrast verified in both themes.
- feat(a11y): `:focus-visible` ring everywhere, `prefers-reduced-motion` plus an in-app toggle wired to the CSS layer, `prefers-reduced-transparency` solid fallback for frosted surfaces.
- feat(platform): `useDeviceClass()` — pointer modality, viewport width, Capacitor native override and `display-mode: standalone`, resolving to one of desktop/mobile/tablet. The APK always renders the mobile shell, even on tablets; safe-area tokens wired.
- feat(brand): **"Feel the Beat"** slogan in the PWA manifest, `index.html` and OG tags; `APP_SLOGAN` constant.
- chore(release): version 2.18.1 across all five sync points (`uv.lock` included).

---

## v2.17.11

Guest-first restore, update feature, and a complete onboarding course.

- fix(auth): **restore the guest-first policy**. A previous pass had removed `get_optional_user` entirely, so the deployed API 401'd search, lyrics, trending, recently-played and the categories grid for anyone without an account — signed out, the app did nothing. Guests again get: search, resolve, categories, lyrics, presets, trending, tracks, library aggregates, downloads (start/list/cancel/retry), stream warm and share links. Account data (likes, playlists, recommendations, analytics, preferences) and instance administration remain strictly authed, and a presented-but-invalid token still 401s — expiry surfaces as a re-login, never as silent data loss. The full matrix is pinned by `test_guest_policy.py` (33 tests; 248 total pass).
- feat(updates): **restore the update banner**. `UpdateNotification` had been orphaned in an App.tsx refactor — version checks fired 5-second toasts nobody could act on while the actionable banner rendered for no one. Remounted in RootLayout; Update unregisters stale service workers and reloads on web, and on native opens the release APK that nginx now serves from `/api/downloads/rheoson-latest.apk` — same applicationId + higher versionCode installs in place, no uninstall, no conflicting packages.
- docs(beginner): **complete onboarding course** under `docs/beginner/` — 20 documents from "what is programming" to a graded 7-level code-review curriculum, every example drawn from this codebase (drift guards, the guest matrix, the apiTarget origin story, the invalidation chain), all internal links verified.

---

## v2.17.10

Hygiene-and-environment release: repairs the corrupted environment files behind the intermittent `Invalid or expired token`, cleans the repository tree of accidental duplicate directories, and crash-proofs the My Music page.

- fix(env): `api/.env` had keys run together (`…ZGV2JACLERK_SECRET_KEY=sk…`), the same key defined up to three times, backend keys in `web/.env` and frontend keys in `api/.env`. pydantic-settings silently reads the last duplicate, so the API has been starting on adjacent-garbage values — the likely source of the intermittent `Invalid or expired token`. Both env files are rewritten one-key-per-line, and every credential was live-verified (Clerk secret → 200, publishable key decodes to `glad-tuna-9004`, Atlas ping OK, API host healthy).
- chore(env): typed env contract — `src/vite-env.d.ts` declares every `VITE_*` variable, so a typo fails the build instead of silently reading `undefined` in production. `web/.env.production` is tracked on purpose (public origin + publishable key only) so native/CI builds can never ship a relative `/api` again.
- fix(downloads): crash on opening My Music — two independent causes. Native: the download foreground service's `stop()` used `startService()`, which throws while the app is backgrounded on Android 12+, and an exception escaping a Capacitor plugin method kills the app. Web: `LibraryTrackRow` read `track.artist.name` unguarded, so one malformed cached track took down the whole page.
- feat(brand): every launcher, splash and notification asset regenerates from `public/assets/logo.png` via the tracked script; the user-supplied icon set is now the single brand master and the stray `android/assets` duplicate tree is gone.
- chore(repo): remove accidental duplicate trees inside `web/` (`api/`, `docs/`, `nginx/`, `music/`, compose files, docs) that shadowed the real ones.
- docs(workflow): versioning documented as `v2.MILESTONE.PHASE` — one annotated tag per finished phase.

---

## v2.17.9

Playback- and connectivity-reliability release: fixes the misconfigured API origin that broke every request in the APK, relays the CDN so audio starts on the first frames, and keeps yt-dlp working when a player client refuses a track.

- fix(client): the build no longer guesses its API origin. An empty `VITE_API_URL` was read as "same origin as the page", which inside the WebView resolved `/api` against the bundled assets and answered every request with `index.html` — the "Backend returned HTML instead of JSON" failure behind the dead player, the empty library and the doctor's "API unreachable". The decision is now a pure, unit-tested function that refuses same-origin mode on native, distinguishes an unset variable from an explicitly empty one, and falls back to the canonical API host with a warning. A CI guard fails any build whose bundle lacks an absolute origin.
- fix(auth): the Clerk publishable key is validated by shape, and a runtime Clerk failure degrades the app to local mode instead of escalating `useUser can only be used within <ClerkProvider />` to react-router's full-page error.
- perf(stream): remote playback now relays YouTube's CDN response instead of waiting on a buffered fill. The client's Range header is forwarded and the CDN's own `Content-Length`/`Content-Range` come back untouched, so audio starts as soon as a URL resolves — not after the whole track has been downloaded — and seeking and duration work. Relayed bytes are teed into the durable cache, so only the first listener pays for the network.
- fix(stream): an opening `bytes=0-` request is no longer treated as a seek on the fallback path. It was waiting for the entire download before answering, which was the multi-second silence before playback began; bounded ranges are still served exactly.
- feat(stream): `stream_service.py` — an empty placeholder until now — owns URL resolution, mime inference, range parsing and range-aware upstream access, shared by the stream route, the warm endpoint and downloads.
- fix(downloads): a download walks a player-client ladder instead of failing on the first refusal. One "Requested format is not available" or "Sign in to confirm you're not a bot" used to end the job permanently; it now tries the default client, then the challenge-free mobile ones, against a selector permissive enough to accept a muxed stream. Transport failures still surface immediately, the error names the failing client, and partial bytes are kept so Resume works.
- fix(brand): the APK ships the real logo. Capacitor's template artwork was still powering the launcher icon, the adaptive background and the splash, and the notification plugin named an icon the project never contained — leaving the download foreground service's notification with nothing to draw. All brand assets are now generated from the logo by a reproducible script.
- feat(brand): one logo component for every brand surface, so the landing hero, auth header, About card and onboarding hero stop drawing their own mismatched music glyphs.

---

## v2.17.8

Playback-reliability release: fixes offline tracks that stopped playing after the format-hint change, makes first-play fast, and hardens the streaming path end to end.

- fix(cache): add a one-time migration that re-fetches or re-labels offline audio blobs stored with the old wrong mime, so previously-cached tracks decode again instead of hanging on load; blobs that can be identified are fixed in place, the rest are replaced from the stream, and only truly dead entries are dropped back to streaming.
- fix(player): the Howler format hint now follows the real container (cached-blob mime → HEAD content-type → m4a for YouTube ids), and a load error no longer nulls the loaded state, which caused the endless tap-to-reload loop.
- fix(downloads): starting a download from a catalog (not-yet-library) track no longer fails with "Track {id} not found" — the modal uses the track object the caller already holds and surfaces the server's real error text.
- perf(stream): durable warm cache on disk plus authenticated prefetch — repeat streams are served from the server cache and first play no longer pays the full yt-dlp cost.
- feat(search): category tiles wear iconic artist portraits instead of emoji badges, and the weekly genre tops are Sunday-anchored with a server-side pre-warm so lists are cached before users open them.
- feat(doctor): the interactive Library Doctor scans for corrupt files, duplicate tracks and empty folders with per-item or confirmed group repair.
- fix(net): a single 14-minute health poller replaces four overlapping ones, with backoff-while-down recovery and Socket.IO auto-revival; pymongo/motor driver chatter is silenced so server logs stay useful.
- feat(search): autocomplete is now purely local (history + seeded artists, zero network calls) and the AI/Ask mode is removed from the product entirely.

## v2.17.7

Account-sync release: settings follow the user across sign-ins, and controls that could not do what they claimed were removed or made honest.

- feat(settings): per-account preference sync — appearance, playback and download preferences persist to the account and apply on any device; one user's changes never affect another's.
- feat(settings): export and restore everything the user owns as a single backup bundle.
- feat(settings): a Doctor screen that turns health probes into one-tap repairs.
- feat(downloads): running jobs show transfer speed and time remaining.
- feat(player): audio bytes are cached locally so replay is instant and works offline; remote playback starts from the CDN stream instead of waiting for a full transcode.
- feat(nowplaying): the Creator tab is rebuilt around the artist and their synced lyrics.
- feat(home,artist,search): weekly charts, artist follows and per-category top tracks.
- fix(auth): the Clerk session token is refreshed on every request, ending the intermittent "Invalid or expired token" failures.
- fix(player): a selected track actually starts playing.
- fix(ui): accent-tinted surfaces render reliably; shared component kit adopted.

## v2.17.6

Wrapped release polish, recommendations closure, and production-readiness pass.

- feat(web): complete the Wrapped year-in-review polish so the hero, stats tiles, and taste summary all resolve with the real listening data instead of showing the coming-soon stub.
- feat(api): close the recommendation gap so the For-you, Discover, and Daily Mix rails no longer render empty when the standalone trending source is missing; the taste profiler now carries genre affinity from per-artist play stats.
- fix(api): finalize the production-readiness pass so the health diagnostics endpoint surfaces a useful instance snapshot (uptime, yt-dlp/ffmpeg versions, config validation, recent 5xx) without leaking internals.
- docs: confirm the docs system is live and the CI test gates are on both main and dev.

- fix(api): harden the download worker so a cancelled or failed job no longer leaves an orphaned staging directory; the cleanup path now removes the job temp root even on hard process-kill paths.
- fix(api): restore the download job persisted store so server restarts no longer blank out the in-flight activity feed; completed jobs survive, in-flight jobs are marked errored.
- fix(api): improve the download filename escaping so tracks with long Unicode titles no longer produce filesystem-invalid names on Termux storage.

- fix(api): stabilize the cross-device playback sync channel so reconnects no longer drop the in-flight position update; newest-wins conflict handling now keeps the live device authoritative for the current playhead.
- fix(api): make the library scan idempotent so the same track sourced from different directories no longer creates duplicate local entries after a rescan.
- fix(web): ensure the offline playback indicator reflects the real fallback state when MongoDB is unavailable so the UI never implies live streaming in local-only mode.

- fix(web): debounce the on-search-onboarding artist picker so rapid taps no longer fire duplicate search requests through the API.
- fix(web): improve the playlist add-to-queue picker so search results inside the queue panel mark already-queued tracks instead of silently duplicating them.
- fix(api): tighten the search-service deduplication so identical queries from different tabs return a stable cached result without re-fetching the provider.
- ci: extend the CI gates so a frontend build warning now fails the workflow instead of silently shipping.

- fix(web): resolve the Android back-button regression so the navigation stack unwinds to the correct route instead of over-closing into the root layout; preserves forward history where expected.
- fix(web): make the floating pill nav resize correctly when the player bar is toggled so the pill never overlaps the controls on narrow viewports.
- fix(web): stabilize the settings sections so panel transitions do not briefly flash the underlying page on mobile during section changes.

- security(auth): strengthen the auth guard so a stale or missing Clerk session never leaves the app in an inconsistent half-authenticated state; refresh paths now reconcile the client session with the backend on every protected navigation instead of assuming the in-memory store is canonical.
- fix(web): tighten the error boundary around the auth route subtree so a Clerk mount failure renders a recover-in-place screen rather than an uncaught React error that can tear down the whole app.

- **security(auth):** register the `/auth/*` route family so Clerk's path-routed sign-in/sign-up multi-step flows (email-code verification, MFA factor-one, SSO callback) land on `/auth/verify`, `/auth/factor-one`, `/auth/sso-callback` instead of falling through to the catch-all — without the wildcard, a user who had just authenticated (or was mid-verification) was bounced back to the landing screen instead of completing sign-in and reaching Home. Adds router regression tests.
- **fix(web):** onboarding artist search debounces keystrokes (250 ms) so typing no longer fires one request per character.
- **fix(api):** the backend test suite is hermetic — `tests/conftest.py` pins Clerk env vars so the dev-mode synthetic-identity fallback can no longer leak into runs on machines without a local `.env` (the 11 environment-dependent failures vanish; 99/99 green anywhere).
- **chore(ci):** add `.github/workflows/ci.yml` so the backend test suite and the web lint/typecheck/unit-test/build gates run on every push and PR to `main`/`dev` — CI now fails when tests fail.
- **docs:** complete documentation system per the documentation strategy interview — progressive index (`docs/README.md`), glossary-enforced terminology, implemented/partial/planned status matrix, six deep dives (streaming, downloads, auth & security, data, frontend, mobile), development guide, operations runbook, contributing guide, security/privacy/terms, and last-verified stamps on every document.
- **chore(license):** the repository previously shipped a GPL-3.0 `LICENSE` file while README/docs claimed MIT. `LICENSE` is now the canonical Apache-2.0 text and `api/pyproject.toml` / `web/package.json` declare it.

- **fix(web):** register the `/auth/*` route family — Clerk's path-routed sign-in/sign-up navigate their multi-step flows to sub-paths (`/auth/verify`, `/auth/factor-one`, `/auth/sso-callback`); only `/auth` was registered, so those steps fell through to the catch-all and bounced users back to the landing screen after authenticating. Adds router regression tests.
- **fix(web):** onboarding artist search debounces keystrokes (300 ms) instead of firing a request per character.
- **fix(api):** test suite is hermetic — `tests/conftest.py` pins Clerk env vars so the dev-mode identity fallback can no longer leak into runs on machines without a local `.env` (11 environment-dependent failures eliminated; 99/99 green anywhere).
- **docs:** complete documentation system per the documentation strategy interview — progressive index (`docs/README.md`), glossary-enforced terminology, implemented/partial/planned status matrix, six deep dives (streaming, downloads, auth & security, data, frontend, mobile), development guide, operations runbook, contributing guide, security/privacy/terms, and last-verified stamps.
- **chore:** license is **Apache-2.0** — the repository previously shipped a GPL-3.0 `LICENSE` file while README/docs claimed MIT. `LICENSE` is now the canonical Apache-2.0 text and `api/pyproject.toml` / `web/package.json` declare it.

## v2.16.5

Production-readiness audit pass: fixes the post-login landing bounce and restart session loss by removing the stale persisted-token 401 path in Clerk mode, gating Clerk session sync on `isLoaded`, and making the auth guard hook-rule-clean; lints to zero and aligns the app version to 2.16.4 across all four synced files.

## v2.16.4

Retention milestone: Wrapped year-in-review page and API, taste onboarding that seeds the profile from 3 picked artists, and current/best listening-streak stats — surfaced on the profile, stats, and wrapped screens.

## v2.16.3

Cross-device playback sync: playback state, current track, position, and queue flow between the account's devices over an authenticated WebSocket connection, with newest-wins conflict handling.

## v2.16.2

Discovery feedback loop: Daily Mixes generated from the user's top genres, one-tap Radio from any track, and a dislike/hide action that trains the taste profile and removes hidden tracks from suggestions, autoplay, and the queue.

## v2.16.1

Stable track identity: a SQLite sidecar maps each YouTube id to its downloaded file, so songs no longer duplicate across search and library, `isDownloaded` is reliable, and liked/history/playlist entries resolve to local playback even when YouTube is unreachable.

## v2.15.6

Fix the MongoDB health probe false alarm (`Motor db.admin` is a collection, not the admin DB) and make the health config check surface a missing Clerk webhook signing secret on production instances.

## v2.15.5

Fix the onboarding redirect loop: a single auth path (Landing → Clerk UI → Home) and the Clerk card no longer clips on mobile.

## v2.15.4

Health system, host fixes, and contract tests. Health is a proper liveness/readiness/snapshot/diagnostics stack with bounded background probing; the keep-alive cold-start bug was traced to a dead ping target; guard-rail tests enforce OpenAPI/auth coverage across the whole route surface.

## v2.15.3

Hardening release for the streaming pipeline and download lifecycle: shared, bounded, disconnect-proof background fill per track; cancellation kills the download process group; dev-only identity bypass, arbitrary download paths, and unbounded artwork fetches closed; auth/stream/lyrics gained per-IP rate limits; six regression tests.

## v2.15.2

Fix the post-splash black screen: AuthGuard loader + public Landing gate handing off to Clerk; auth store boots at startup; redundant WebSocket heartbeat removed; stable TypeScript codegen output.

## v2.15.1

Clerk auth integration: prebuilt Clerk components replace custom login/register, landing page with Get Started CTA, artwork proxy for APK CORS, dev-mode auth bypass, users synced to MongoDB via the Clerk webhook.

## v2.14.19 – v2.14.21

Guest mode removed and auth enforced on every endpoint with per-user isolation (v2.14.19); production-readiness fixes for CORS origin merge, duplicate Pydantic schema, Clerk config mis-scoping, dev-mode auth bypass, and client error-handling infrastructure (v2.14.20); Clerk JWT injection on API requests and OpenAPI operation-ID fix (v2.14.21).

## v2.14.1 – v2.14.18

Iterative feature/hardening releases: functional Settings sections (notifications→sounds, layout, audio EQ/effects engine, advanced download options with per-job staging, storage/privacy/account audits), duplicate-safe queue with add-from-queue search, `/full-player` route with legacy redirect, enriched search history, stream warm-up endpoint (`POST /stream/{id}/warm`), MongoDB-free local mode fallback, recommendation taste profile with genre inference, full Creator tab and karaoke lyrics, custom playlist covers, suggested songs, unified My Music page, floating pill nav polish, universal track context menus, end-of-queue autoplay, endpoint surface completion, settings-directory persistence crash fix.

## v2.13.0-beta.1 – v2.13.4

Offline-first architecture (beta), runtime data-safety audit + MongoDB Atlas config, generated TypeScript contract (`v2.13.2`), Clerk webhook with Svix HMAC verification (`v2.13.3`), user profile page (`v2.13.4`).

## v2.12.0 – v2.12.2

Recommendation signal recording system, core recommendation engine, recommendation API endpoints + frontend integration.

## v2.11.0 – v2.11.9

The Rheoson era: identity rename from Shulker, MongoDB infrastructure, user authentication and account storage, instant playback architecture, structure cleanup, merged-application regression fixes, dev/prod API environments, Rheoson branding, update checking, performance and production verification.

## v2.8.0 – v2.10.0

Stream cache, search UX, 404 page, player fixes (v2.8.0); the 25 documented bugs from `BUGS.md` fixed (v2.9.0); critical bug fixes (v2.10.0).

## v2.1.0 – v2.7.8 (Shulker)

File-rename restructure and the settings overhaul era (per-section redesigns, layout/font/audio preferences persisted), WebSocket URL fixes, prod-baked `.env.production`, Capacitor build fixes, CORS builtins, Jekyll landing page and Pages deployment, keep-alive cron, custom Swagger UI, artwork proxy + `ArtworkImage` component, ytmusic thumbnail fix, artist endpoint.

## v1.0.0 – v1.3.4 (Shulker)

Initial working release through the pre-auth era: asyncpg + Docker multi-stage build (abandoned for the file-based library), yt-dlp direct pipe streaming, PWA full service worker, APScheduler cron jobs, search debounce, library redesign, toasts, and the rhea sound.

---
