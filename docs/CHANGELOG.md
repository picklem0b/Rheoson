# Changelog

All notable changes to Rheoson are documented here.

Format: `v(major).(minor).(patch)[-rc]` — **annotated** tags (`git tag -a`), pushed with `--follow-tags`. The tag message is the release summary; the four synced version files (`api/pyproject.toml`, `web/package.json`, `web/src/lib/constants.ts`, `api/app/main.py`) carry the `APP_VERSION`.

---

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
