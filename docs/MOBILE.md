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
    app/              routes (expo-router file routing)
    src/api/          the API surface, one module per domain
    src/components/   UI kit + feature components
    src/hooks/        playback, downloads, likes, offline mirror
    src/services/     session, audio engine, socket, crash reporting
    src/store/        zustand: player, queue, settings
packages/
  api-types/          generated OpenAPI types, shared by both apps
api/                  FastAPI backend (unchanged)
cli/                  terminal client (unchanged)
```

The workspace is pnpm (`pnpm-workspace.yaml`, `.npmrc` with `node-linker=hoisted` — Metro resolves
through the physical `node_modules` tree, not pnpm's symlinks).

## No sign-in wall: guest sessions

The app opens into music. On first launch it asks the server for a **guest session**
(`POST /api/auth/guest`), stores the token in the keychain, and uses it for every request.

A guest is a real account as far as storage is concerned:

* the server generates the id (`guest_<uuid4>`); nothing in the request can name an existing
  identity, so a guest token can only ever reach its own likes, history, playlists and follows;
* the token is an HS256 JWT signed with `GUEST_TOKEN_SECRET` (falling back to `CLERK_SECRET_KEY`),
  issuer `rheoson:guest`, valid for a year;
* `ALLOW_GUEST_ACCOUNTS=false` turns the whole mechanism off (`ACF02`), and an instance with no
  signing secret refuses to mint anything rather than issue a forgeable token.

Clerk is still how a *real* account signs in on the web. Linking a guest's library to an account is
a migration problem (which side wins) and is deliberately not implemented yet.

## Building the APK

```bash
cd apps/mobile
pnpm install
pnpm build:apk:preview     # eas build --profile preview --platform android → APK
```

`eas.json` defines `development`, `preview` (internal-distribution APK) and `production`
(app-bundle). `app.json` carries `com.lethabo.rheoson`, `versionCode 22500`, and the Android
permissions the player needs (`FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`, `POST_NOTIFICATIONS`).

Local prebuild instead of EAS:

```bash
cd apps/mobile && npx expo prebuild --platform android
cd android && ./gradlew assembleDebug
```

`plugins/withAndroidBuildArchs.js` pins the packaged ABIs to `arm64-v8a`. React Native ships native
libraries for four ABIs by default and the New Architecture is off (`react-native-track-player`
needs the old one), so the plugin writes both `reactNativeArchitectures` and an explicit
`ndk { abiFilters }` — the property alone is ignored without the New Architecture.

### Signing

`credentials/rheoson-release.keystore` is the keystore the Capacitor era carried for release builds
(it was never wired up, so no shipped APK is signed with it). EAS can manage credentials itself
(`eas credentials`), or this key can be uploaded to keep a stable signing identity. Note that an
APK signed by a *different* key cannot install over an existing install — uninstall once when
moving from the Capacitor build.

## What ships today

| Surface | State |
| --- | --- |
| Welcome screen (no splash, no sign-in) | done |
| Guest session + token in keychain | done |
| Home (recently played, recommendation shelves, weekly trending) | done |
| Search (tracks/albums/artists/playlists + recent searches) | done |
| Library, Downloads, Settings | in progress |
| Full player (queue, seek, repeat, shuffle) | in progress |
| Album / Artist / Playlist pages | in progress |
| Offline mirror (likes, history, playlists, follows) | done (hook + storage) |
| Crash reporting to `/api/diagnostics/crash` | done |
| Downloads (create/cancel/retry + live progress over Socket.IO) | client done, screens in progress |
| Messaging, blends, stats, wrapped | not started (account-only features) |

## Verification status

`apps/mobile` typechecks and bundles are the gate for every step; `pnpm typecheck` at the root runs
both apps. The backend suite covers the new guest-session routes
(`api/tests/test_guest_sessions.py`).
