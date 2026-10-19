# Mobile app — `apps/mobile`

The phone build is a **React Native app (Expo SDK 52, expo-router)**. Capacitor is gone: the old
`apps/website/android` shell was a WebView around the web bundle, and it was replaced rather than
patched, because the two behave differently in the places that matter on a phone — a native audio
engine with a lock-screen notification, real offline storage, and lists that scroll at 60fps.

`apps/website` remains the browser build (same backend, same API contract).

## Layout

```
apps/
  website/            React + Vite PWA (was web/)
  mobile/             Expo app, built to APK with EAS
    index.js          entry: registers the playback service, then expo-router
    src/app/          routes (expo-router file routing)
    src/api/          the API surface, one module per domain
    src/components/   UI kit + feature components
    src/hooks/        playback, downloads, likes, offline mirror
    src/services/     session, audio engine, socket, crash reporting
    src/store/        zustand: player, queue, settings, offline, sheets, toasts
packages/
  api-types/          generated OpenAPI types, shared by both apps
api/                  FastAPI backend (unchanged)
cli/                  terminal client (unchanged)
```

The workspace is pnpm (`pnpm-workspace.yaml`, `.npmrc` with `node-linker=hoisted` — Metro resolves
through the physical `node_modules` tree, not pnpm's symlinks).

## No sign-in wall: guest sessions

The app opens into music. On first launch it asks the server for a **guest session**
(`POST /api/auth/guest`), stores the token in the keychain, and uses it for every request. The
welcome screen is shown once; later launches go straight to Home.

A guest is a real account as far as storage is concerned:

* the server generates the id (`guest_<uuid4>`); nothing in the request can name an existing
  identity, so a guest token can only ever reach its own likes, history, playlists and follows;
* the token is an HS256 JWT signed with `GUEST_TOKEN_SECRET` (falling back to `CLERK_SECRET_KEY`),
  issuer `rheoson:guest`, valid for a year;
* `ALLOW_GUEST_ACCOUNTS=false` turns the whole mechanism off (`ACF02`), and an instance with no
  signing secret refuses to mint anything rather than issue a forgeable token.

Clerk is still how a *real* account signs in on the web. Linking a guest's library to an account is
a migration problem (which side wins) and is deliberately not implemented yet.

## What ships today

| Surface | State |
| --- | --- |
| Welcome, shown once, no splash and no sign-in | done |
| Guest session + token in the keychain | done |
| Home: continue card, recently played, recommendation shelves, weekly trending, pull to refresh | done |
| Search: live debounced results, recent searches, category browse, `?q=` deep link | done |
| Library: playlists, favourites, albums, artists, recent; create playlist; clear history | done |
| Full player: drag-to-seek, transport, repeat all/one, shuffle, like, share | done |
| Queue sheet: jump to an upcoming track, remove one, clear | done |
| Lyrics sheet: synced line highlighting, tap a line to seek | done |
| Track sheet from any row (long press): play next, queue, like, playlists, downloads, artist/album, share | done |
| Album page: ordered track list, play, shuffle, download the whole album to the server | done |
| Artist page: popular tracks, albums, singles, related, follow/unfollow | done |
| Playlist page: play, shuffle, rename, delete, remove a track via its sheet | done |
| Downloads: live progress, speed/ETA, cancel, resume-aware retry, delete, download by URL | done |
| Settings: theme, playback switches, Wi-Fi-only downloads, saved audio, server health, reset guest | done |
| Listening stats: play counts, estimated hours, streaks, top tracks/artists, day/hour bars | done |
| Offline audio: save a track to the phone, played from `file://` with no connection | done |
| Offline metadata mirror (likes, history, playlists, follows) | done |
| Crash reporting to `/api/diagnostics/crash` | done |
| Account sign-in and guest-to-account linking | not implemented |
| Messaging, blends, wrapped | not implemented (account-only on the web) |
| Playlist track reordering, equalizer, sleep timer | not implemented |

Downloads in the **Downloads** tab are server-side jobs (yt-dlp writes into the server's music
folder). "Keep on this device" in a track's sheet is the separate, on-device copy: it downloads the
stream into `documentDirectory/offline-audio/`, and the player prefers that file over the network.
Saving is per track; the album action queues the whole record on the server.

## Building the APK

EAS owns the build, the keystore and the artifact — no Android SDK on the machine is needed.

```bash
cd apps/mobile
pnpm install
pnpm build:apk:preview      # npx eas-cli build --profile preview --platform android
```

`app.json` is linked to the EAS project `@the_devi/rheoson`
(`extra.eas.projectId: 923cee7a-6e2a-4d01-891f-0bd87b9dc4a0`, `owner: the_devi`). This mirrors the
NewzCrime mobile setup: the same `cli.version`/`appVersionSource: local` in `eas.json`, the same
`preview` (internal APK) and `production` (auto-incremented app bundle) profiles, and EAS-managed
remote Android credentials.

`eas.json` defines `development`, `preview` (internal-distribution APK) and `production`
(app-bundle). `app.json` carries `com.lethabo.rheoson`, `versionCode 22500`, and the Android
permissions the player needs (`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`,
`WAKE_LOCK`, `POST_NOTIFICATIONS`).

Build status and logs: <https://expo.dev/accounts/the_devi/projects/rheoson/builds>.

### Local build instead of EAS

```bash
cd apps/mobile && npx expo prebuild --platform android
cd android && ./gradlew assembleDebug
```

This needs a working Android SDK/JDK and produces an unsigned (debug-key) APK. On Termux the
configured `android-sdk` directory may make this possible, but EAS is the supported path and the
only one that keeps a stable release signing identity.

### Verifying the bundle without a build machine

```bash
cd apps/mobile
npx tsc --noEmit
npx vitest run
npx expo export --platform android --no-bytecode --output-dir /tmp/rheoson-export
```

`--no-bytecode` matters on Termux: the SDK's prebuilt `hermesc` is a Linux x86-64 binary and dies
with `SIGILL` under Android, which is a host limitation rather than a bundle failure. The JS export
still proves every import resolves and every asset is present; EAS compiles Hermes in the cloud.

`plugins/withAndroidBuildArchs.js` pins the packaged ABIs to `arm64-v8a`. React Native ships native
libraries for four ABIs by default and the New Architecture is off (`react-native-track-player`
needs the old one), so the plugin writes both `reactNativeArchitectures` and an explicit
`ndk { abiFilters }` — the property alone is ignored without the New Architecture. Both are applied
through the Gradle mods' `(config, action)` API; calling them as plugin factories silently produced
an empty project the first time this was bundled.

### Signing

EAS generated and stores the Android keystore for `preview` builds (`eas credentials` to inspect or
replace it). The APK signed by a *different* key cannot install over an existing install —
uninstall once when moving from an older Capacitor build. `credentials/rheoson-release.keystore`
is a leftover from the Capacitor era and is not used by EAS.

## Verification status

`apps/mobile` typechecks, its 12 Vitest tests cover the queue's split/advance/rewind transitions,
shuffle/unshuffle and the saved-audio size arithmetic, and `expo export` bundles the whole app. The backend suite covers the
guest-session routes (`api/tests/test_guest_sessions.py`). The app has not been run on a physical
device in this environment; the EAS preview build is the artifact to install and exercise.
