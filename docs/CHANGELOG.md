# Changelog

All notable changes to Rheoson are documented here.

Format: `v(major).(minor).(patch)[-rc]` — **annotated** tags (`git tag -a`), pushed with `--follow-tags`. The tag message is the release summary; the four synced version files (`api/pyproject.toml`, `web/package.json`, `web/src/lib/constants.ts`, `api/app/main.py`) carry the `APP_VERSION`.

---

## v2.19.12

A full accounting of what streaming and downloading do not need.

**Streaming has no transcode anywhere** (verified by grep: no executable ffmpeg reference remains on the path), so it costs no latency. The audit of "what isn't needed" found these instead:

- fix(streaming): **the yt-dlp fill could stall mid-track on a chatty run.** Its stderr was `PIPE`d and never read, so once a run wrote more than the OS pipe buffer (64 KB) — exactly what the client-ladder retries produce — yt-dlp blocked on stderr and the audio flow stopped with it. Now `DEVNULL`: those bytes were never used.
- fix(downloads): **the format ladder duplicated embedding work.** The command carried `--add-metadata` and `--write-thumbnail --embed-thumbnail`, but the pipeline's own mutagen pass (`_tag_and_finish`, added in v2.19.9) already writes tags and artwork with proper support for every container the ladder can produce — yt-dlp's CLI embedders are MP3-only, so on anything else they did nothing, and on MP3 they did the job twice. Dropped; the mutagen pass is the single owner of tagging.
- fix(downloads): the **embed-metadata / embed-artwork toggles are now honoured.** They were forwarded to yt-dlp's embedders and nowhere else, so turning them off disabled only the CLI path (which itself no longer ran). The choices now reach `_tag_and_finish`: metadata off leaves the source tags untouched, artwork off skips the cover fetch.
- fix(metadata): `write_tags` accepts `title=None`/`artist=None` to leave a field untouched, which is how "no metadata" is expressed without stripping what the source already carried. Artwork remains independent of the metadata toggle.
- fix(doctor): the missing-ffmpeg impact copy claimed playback "falls back to the untranscoded stream" as if that were a degradation. Playback always streams the native audio and is unaffected; only downloads change behaviour. Copy corrected.
- docs: removed the remaining "transcode" wording from the streaming modules — the fast-path comment, the sniff docstring, and `stream_service`'s module and selector docstrings now describe the relay for what it is.
- test: `write_tags` partial-field behaviour across containers; download command assertions pin that no CLI embedder flags return.

## v2.19.11

Follow-up to the container/type fix: resolving what the inert streaming flags were actually for.

- refactor(streaming): **streaming now states its real intent — relay the native audio stream, never transcode.** The yt-dlp invocation carried `-x --audio-format mp3 --audio-quality …`, which do nothing when the output is a pipe (a post-processor needs a real file to re-encode) and whose only real effect was to imply audio-only format selection. Streaming is deliberately left untranscoded: browsers decode YouTube's native m4a directly, re-encoding lossy→lossy would only degrade quality, and the warm cache would end up holding a re-encoded copy when the native stream is the best version to keep. The audio-only selector is now requested explicitly via `--format`, which is also what removes the ffmpeg/host fork — one identical command everywhere, no `has_ffmpeg()` branch on the streaming path. `AUDIO_FORMAT` keeps governing downloads, where it genuinely applies.
- chore(streaming): `_fill_buffer_transcode` renamed to `_fill_buffer_ytdlp` — the old name described a thing the function never did, and it was that mismatch which hid the wrong-Content-Type bug in the first place.
- test: the container-mime suite asserts the spawned command requests `bestaudio…` explicitly and carries no `-x`, so a regression here would pipe video into an audio buffer rather than fail a sniff.
- test(helper): the test suite's temp base is removed at exit (registered at import, so an aborted run still cleans up).

## v2.19.10

Found by playing a real track end to end with the CDN fast path forced out.

- fix(streaming): **the fallback served audio under a Content-Type that did not describe it.** A remote session was created with a hardcoded `audio/mp4`, and the growing-buffer response built its headers from that value *before* the fill had a chance to correct it — so on the transcoding fallback the server announced one container while streaming another. The response sets `X-Content-Type-Options: nosniff`, so nothing downstream could repair it. Sessions now wait (bounded, and normally free) for the fill's report of the container it is actually producing.
- fix(streaming): **the fill inferred its container from `has_ffmpeg()` instead of reading the bytes.** The rule was “ffmpeg is installed, therefore the output is mp3”. That is false: yt-dlp is piped to stdout and a post-processor needs a real file to run against, so the bytes are the stream YouTube served (m4a) on every host. Verified directly — the same command writing to a file yields a genuine `MP3 ADTS`, while writing to stdout yields `ftypmp42`. The container is now sniffed from the first chunk, which the existing `_sniff_audio_mime` already detected correctly and nothing called on that path.
- fix(streaming): the bounded-wait fallback no longer consults `AUDIO_FORMAT` for the same reason; it reports `audio/mp4`, the honest expectation for a piped stream.
- test: the streaming fill is driven with a stubbed yt-dlp process and asserted to report the container from the bytes with ffmpeg both present and absent, so the inference cannot come back (4 new tests), plus two session-level tests that the growing-buffer response carries the fill's type and that a failed fill still releases the wait (6 new tests).

## v2.19.9

Found by downloading a real track end to end instead of trusting the unit suite.

- fix(websocket): **a download started while no client was connected died immediately.** `ws_manager.emit` logged `log.warning("ws.emit.queued", event=event)`; structlog binds the first positional argument to a reserved `event` key, so the keyword collided and raised `TypeError`. `emit` is called at the top of `_download_task`, so that TypeError propagated straight out of the emit call and killed the job before it fetched a byte — the exact “downloading doesn’t work” symptom. The same collision sat on the failure and queue-full paths, where it replaced the real error with a logging error. All three now use `event_name`, and `emit` is total: a transport or logging failure can no longer fail the caller.
- fix(downloads): **tagging never ran.** `_tag_and_finish` imported `write_tags` from `metadata_service`, which only had readers, so every download reported `download.tag.failed — cannot import name 'write_tags'` and landed an untagged file with no cover art. Implemented the writer for `mp3` (ID3), `m4a`/`mp4`/`aac` (iTunes atoms), `flac` and `ogg`/`opus` (Vorbis comments), including embedded artwork, lyrics, track number and year. Artwork MIME is sniffed from the bytes rather than guessed from the URL, and zero-length artwork is skipped instead of stored as a broken frame.
- fix(metadata): `extract_artwork_bytes` returned nothing for `ogg`/`opus`. It looked for a value with a `.data` attribute, but the Vorbis convention stores artwork as a base64-encoded FLAC picture in `metadata_block_picture`, which is a plain string. Now decoded properly, so an embedded cover is served back for those containers.
- chore(deps): yt-dlp `2026.3.17` → `2026.8.19` through the lockfile.
- test: the emit helper (buffering, transport failure, bounded queue), a source guard against reintroducing the reserved `event` keyword anywhere in `app/`, and `write_tags` across all five containers round-tripped through the library scanner's own reader (14 new tests).

## v2.19.8

Milestone 2.19 phase 8/8 — close-out.

- fix(state): **a like made anywhere refreshes the surfaces that render track rows.** The registry from v2.19.4 covered the count, the liked list, library rows and shelves, but album, artist, artist-content, trending, category charts and open playlists all render their own `isLiked` rows and were left out — a heart tapped on the player could sit stale on an album or chart the user was looking at. Those keys now live in `lib/queryKeys.ts` and `invalidateLikeSurfaces` covers them.
- fix(album): the album's like button read IndexedDB exactly once on mount and never subscribed, so it could not follow a like made elsewhere. It now reads the shared liked set (a cheap IDs query) and keeps a short optimistic override until that set catches up.
- fix(playlist): the playlist page and the add-to-playlist sheet invalidated their keys inline; they now call the shared helpers, so a rename or an add refreshes the list and any open playlist in one place.
- refactor(state): Trending, CategoryGrid, Artist and Album queries go through the shared registry rather than spelling their keys inline.
- fix(a11y): `InfoTooltip` is a click disclosure, not a hover tooltip, so its panel no longer carries `role="tooltip"` (which is announced on hover/focus, not activation). The trigger keeps `aria-expanded` / `aria-controls`, which is what a disclosure should expose.
- docs: feature status, roadmap and README brought current with the 2.19 line.

## v2.19.7

Milestone 2.19 phase 7/8 — creator surfaces.

- feat(nowplaying): **the creator tab is a real artist destination.** It carries the artist's identity header with reach (monthly listeners, or subscribers), a **Popular** chart of their top tracks that plays in place, and a horizontal **Releases** rail that mixes albums ahead of singles so the row reads as a discography. A route into the full artist page closes it off.
- fix(nowplaying): the tab previously duplicated the lyrics that the Lyrics tab already owns, so a track with lyrics showed the same words twice. Lyrics now live only where they are labelled, and the creator tab spends its space on who the artist is and what they have made.
- feat(nowplaying): the profile-unavailable state names the situation plainly ("No profile available for this artist") and offers an **Open** action instead of dead-ending.
- fix(state): the follow button used ad-hoc query keys and invalidated nothing, so a follow made here was invisible to the following list and artist page until reload. It now reads and writes through the shared registry and calls `invalidateArtistFollowSurfaces`.
- chore(types): added `qk.artistContent` and refreshed the generated OpenAPI contract.

## v2.19.6

Milestone 2.19 phase 6/8 — library information architecture.

- feat(library): **the library is one page of stacked sections, not a tab strip.** Liked songs, playlists, albums and artists each carry a real heading — icon chip, title, and count — with a rule that fades out across the width to separate them. Previously only the selected tab existed on screen, so the row of tabs hid three quarters of the library and its headings had no weight to carry.
- feat(library): every section's query runs with the page, so nothing waits on a tab the user may never open, and each section keeps its own loading skeletons and empty state.
- fix(library): the page had accumulated two query-key spellings (`['liked-tracks']` against the registry's `qk.likedTracks()`, and album/artist lists that had no registry entry at all). They now go through `lib/queryKeys.ts`, so likes and playlist changes refresh the library the same way they refresh every other surface.
- fix(ui): dropped the unreachable `liked` branch from the library's empty-state map (liked songs render their own section state) and tidied the Phosphor import into the project's multi-line form.

## v2.19.5

Milestone 2.19 phase 5/8 — browse and discovery.

- feat(ui): **category tiles have presence without taking over the screen.** Tiles grow from 92px to 124px (140px from `sm`), the genre label steps up to a readable size, and the chevron matches it — a proper browse target rather than a cramped chip.
- feat(browse): a category chart now shows **ten** tracks instead of five, in the same row treatment as the library, with room around it on larger screens.
- fix(ui): removed the implementation copy that sat under every category heading ("Refreshed weekly and cached on the server"). The explanation is real and useful, so it moved behind an info affordance rather than being deleted.
- feat(ui): new `InfoTooltip` primitive — an info icon that opens a short explanation on click (works on touch), closes on Escape or an outside tap, and announces its expanded state. Explanations no longer have to occupy permanent space in a heading to be available.
- docs: album, artist and playlist pages were confirmed as complete routed destinations (`/album/:id`, `/artist/:id`, `/playlist/:id`) rather than stubs.

## v2.19.4

Milestone 2.19 phase 4/8 — instant state.

- fix(state): **a like now refreshes every surface that shows it.** Query keys were written inline at each call site, and two surfaces asking the same question spelled them differently — the profile read a count under `['tracks','liked','count']` while the tray invalidated `['liked-count']`. Liking a track from the player therefore invalidated nothing and the count sat stale on pages the user was not looking at. Keys now live in one registry (`lib/queryKeys.ts`) and mutations call surface-wide helpers (`lib/queryInvalidation.ts`): likes refresh the count, the liked list, library rows, history and recommendation shelves; playlists refresh the list and any open playlist; follows refresh the artist and the following list; plays refresh history and stats.
- fix(state): the like toggles in PlayerBar and NowPlaying did not invalidate anything at all; they now do, so a heart tapped on the player updates the profile counter without a reload.
- feat(state): **remembered answers paint instantly.** A small, whitelisted localStorage snapshot (`lib/querySnapshot.ts`) restores the like count, playlist list, recently-played and following list on the next visit, so a page shows a known number immediately instead of a spinner. Nothing large is stored (no library listings, no search results), entries older than 24 hours are ignored, and every restored value is stamped as already-stale so the server's answer still replaces it.
- fix(privacy): the snapshot is namespaced per account and wiped on sign-out, so a shared device cannot show the next person the previous account's counts. Storage being unavailable degrades to a no-op rather than an error.
- test(state): the registry's whitelist, each invalidation group, and the snapshot's restore/staleness/per-account/sign-out behaviour are covered (9 new tests).

## v2.19.3

Milestone 2.19 phase 3/8 — the account contract.

- feat(auth): **identity is a username, and only a username.** The product has no first or last name, so the Clerk webhook no longer derives one: `user.created`/`user.updated` record `username` (Clerk's field, with the email local part as a fallback for accounts that predate it being required) and drop `name`/`first_name`/`last_name` entirely. The user document, `/auth/me` and the profile screen all speak username.
- fix(auth): `PATCH /auth/me` validates the username server-side — `3–32` characters from `A–Z a–z 0–9 _ .`. It becomes the display name and the handle a future messaging feature will address people by, so its shape is enforced rather than trusted; Clerk owns uniqueness.
- feat(ui): the profile editor, settings account row, sidebar profile button and profile card all read `username`; the previous `fullName` fallback is gone so a signed-in account can no longer show a first/last-derived name.
- docs(auth): the account contract is now written down — username rules, "email or phone, at least one", password minimum, and the Clerk instance configuration it maps to, including the NIST note that 15 characters is the stronger minimum for single-factor sign-in.
- test(accounts): sign-up payloads that carry a username and no name, the email-local-part fallback, username updates, and the server-side shape validation are all covered.

## v2.19.2

Milestone 2.19 phase 2/8 — the auth and API trust boundary.

- fix(auth): **removed the account-takeover login proxy.** `POST /auth/login` and `POST /auth/register` looked a user up by email and called Clerk's Backend API to create a session, which performs no password check — knowing an email address was enough to obtain that account's session. No client called them; sign-in is handled by Clerk's hosted components, which verify the credential before a session exists. A regression test pins them as gone.
- fix(downloads): **jobs are scoped to their owner.** Job state is process-global, so every signed-in account could list and cancel everyone else's downloads. Jobs now record an owner at enqueue time, and listing, fetching, cancelling, retrying and deleting all filter on it. Jobs recorded before ownership existed stay reachable so an upgrade does not strand a running transfer.
- fix(authz): the library Doctor's scan and repair routes are admin-only. Both walk and delete files in the shared music library, so they now sit behind the same instance-configuration gate as the directory and rescan routes; the diagnostics screen explains the restriction in plain language instead of echoing the server's configuration instructions.
- fix(config): **environment validation fails closed.** An unrecognised `ENV` (`prodction`, an empty value, a typo) selected development defaults — an insecure `SECRET_KEY`, a relaxed Clerk requirement, an open admin allowlist — on a host that was actually serving users. Only the explicit development aliases relax the posture now, names are matched case-insensitively, and an unrecognised value is reported at startup.
- fix(auth): Clerk issuer matching is host-exact. Substring matching accepted `https://clerk.com.attacker.tld`, which is exactly the forgery the issuer check exists to prevent. A new `CLERK_ISSUER` setting pins a custom domain exactly.
- fix(webhooks): replayed deliveries are ignored. Svix retries any delivery it believes failed, so a verified signature did not make a replay harmless — a duplicate `user.created` re-ran the handler. Delivery ids are claimed in `webhook_events` (unique `_id`) and a duplicate becomes a no-op.
- fix(downloads): job persistence is atomic — write to a sibling temp file and rename, so a crash mid-write can no longer leave a truncated jobs document that the loader reads as "no jobs", discarding every job's resume state.
- fix(data): the visitor counter counts accounts, not logins. It moved from the removed login proxy to `user.created`, gated on the upsert actually inserting, so replayed events cannot double-count.
- docs(api): the auth section documents why no credential proxy exists, and the guest matrix now lists downloads as session-required.

## v2.19.1

Milestone 2.19 phase 1/8 — playback and download reliability.

- fix(downloads): **ffmpeg is resolved, not assumed.** Audio extraction (`-x`), format conversion and thumbnail embedding all shell out to ffmpeg, so a host without it failed every download with a raw subprocess tail. `app/core/toolchain.py` locates both binaries (explicit `YTDLP_BIN`/`FFMPEG_BIN` override → `PATH` → Termux `$PREFIX/bin` → system directories), caches the result, and reports it; every yt-dlp invocation now passes `--ffmpeg-location` so post-processing works outside an interactive shell.
- fix(downloads): **a download no longer dies without ffmpeg.** When no ffmpeg is resolvable the job switches to the audio-only `bestaudio` ladder (`m4a`/`mp4`/`webm`, all library extensions now) and skips the post-processors, so the track still lands instead of failing.
- fix(streaming): the transcoding fallback relays the raw audio-only container when ffmpeg is absent, instead of refusing to play; the buffer's mime type is sniffed from its first bytes rather than assumed to be MP3.
- feat(tooling): the Doctor gains an **Install ffmpeg** repair beside the existing yt-dlp update. Termux installs it through its own package manager with no privilege escalation; other hosts are handed the exact command. A tool change re-probes health immediately so the result is visible at once.
- feat(tooling): `GET /settings/tools` reports what the host can actually do (downloader present, transcoder present, install hint); the daily yt-dlp cron runs through the resolved binary and logs tool readiness, so a missing ffmpeg shows up in the log rather than only in a failed download.
- fix(downloads): **failure copy is user-safe.** The raw `yt-dlp exited with code 1 (…)` tail no longer reaches the UI — the log keeps the diagnostic, the user gets an actionable sentence — and the failed-download pill no longer leads with a video id when metadata resolution failed.
- fix(ui): removed the last `DownloadSimple` text corruption from the earlier icon migration (`DownloadSimple failed`, menu labels, section titles, download buttons and adding-to-library copy) and the module comments that described it.
- fix(library): `mp4`/`webm` audio containers are indexed and served; extension matching is case-insensitive everywhere.
- test(toolchain): resolution order, the ffmpeg-absent download and stream fallbacks, and the no-leak failure copy are covered by a new suite; the download ladder tests pin the post-processor so the host's own ffmpeg cannot change what they measure.

## v2.18.7

Redesign phase 7/7 — motion governance and the status-token close-out.

- feat(a11y): reduce-motion now honors the OS-level `prefers-reduced-motion` setting in addition to the in-app toggle — framer-motion animations jump to their end state and the CSS layer collapses non-framer motion when either signal is active, tracked live so changing the system setting takes effect without a reload.
- feat(tokens): every raw status color is gone — 76 sites across 16 files (badges, toasts, error displays, download failures, doctor diagnostics, profile chips, quality badges) now read the semantic `--danger`/`--success`/`--warning` families, which stay legible in both themes and track the palette.
- fix(tokens): the base `--danger`/`--success`/`--warning` variables were missing (only the `-rgb`/`-text`/`-bg` variants existed); the base tokens now back every status reference.
- feat(tokens): a `--warning` pair joins the status family in both themes with AA-contrast text colors.
- fix(ui): Button's danger variant, Badge's success/warning variants, Toast icons, and ErrorDisplay all read tokens instead of hard-coded Tailwind palette colors.
- chore(docs): CLAUDE.md documents the two-shell layout system and the status-token rule.

## v2.18.6

Redesign phase 6/7 — settings, auth, landing.

- feat(settings): status colors move onto semantic tokens — pass/warn/fail states in Diagnostics, LibraryDoctor badges, Privacy/Notifications icon chips, and danger rows all read `--success`/`--warning`/`--danger`, so they stay legible in both surfaces and track the palette instead of hard-coded hexes.
- fix(settings): Diagnostics' dark-only `bg-black/20` icon wells render `--bg-elevated` and work in light mode; a new `--warning` token pair joins the status family in both themes.
- fix(settings): two user-facing strings still carried icon names from the icon migration — the shortcut list said "DownloadSimple current track" and Storage showed an Android path `/storage/emulated/0/DownloadSimple`; both restored to real text.
- feat(landing): the sign-in button no longer addresses the auth vendor by name ("Continue with Clerk" → "Sign in"), and the gate carries the brand slogan as an accent-colored eyebrow above the description.
- fix(auth): auth.css fallbacks updated from the retired purple palette to the current crimson identity, so pre-hydration flashes match the active theme.
- fix(settings): SettingsRow danger text uses `--danger-text` instead of a raw Tailwind red.

## v2.18.5

Redesign phase 5/7 — detail pages and Profile.

- feat(detail): **Album, Artist and related-artwork placeholders** move from per-item gradient pools to the token layer — a muted duotone glyph on `--bg-overlay`, hairline borders. The Artist hero is now readable in both themes: theme-aware text over the artwork fade instead of white-with-drop-shadow, and a token backdrop when no image exists.
- feat(profile): the profile banner, avatar initials, stat icons and quick links drop their six raw hue assignments for one accent treatment; presence dot uses the new `--success` token pair (added alongside `--danger` in the token layer).
- fix(downloads): error rows use the semantic `--danger` tokens instead of raw reds.
- feat(wrapped): the hero card keys off the neutral ramp with the accent reserved for charts and highlights; empty-state and bar-chart fuchsia literals replaced by tokens.
- fix(profile): user-facing copy corrupted by the icon codemod repaired ("History, data, legal").
- feat(playlist): destructive delete actions use the Button `danger` variant and `--danger` text tokens. The user-chosen gradient cover picker remains product functionality and is untouched.
- chore(release): version 2.18.5 across all five sync points.

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
