# Deep Dive — Mobile / Android

> Companion pages: [Frontend Internals](FRONTEND.md) (the WebView runs the same app), [Deployment](DEPLOYMENT.md#android-apk-builds) (build commands). Source: `web/capacitor.config.ts`, `web/android/`.

## Model

The Android app is a **Capacitor 8 shell** around the production web build:

```
┌────────────────────────────────────┐
│  Android APK                       │
│  ┌──────────────────────────────┐  │
│  │  WebView (bundled web/dist)  │  │
│  │  React app + service worker  │  │
│  └──────────────┬───────────────┘  │
│                 │ CapacitorHttp /  │
│                 │ native plugins   │
│  Filesystem · Network · Splash ·   │
│  StatusBar · KeepAwake · Haptics   │
└────────────────────────────────────┘
```

`NODE_ENV=production` at build time bakes `VITE_API_URL` into the JS bundle — the APK is self-contained and talks to your server directly. `CapacitorHttp` replaces `fetch` with a native client, bypassing WebView CORS entirely (what makes LAN/Termux backends work without proxy tricks).

## Environment separation

| Build | API target | How |
|-------|-----------|-----|
| Dev server (`npm run dev`) | `/api` → Vite proxy → localhost:8000 | Dev only |
| Dev WebView (`RHEOSON_DEV_URL=… cap run android`) | Vite dev server over LAN (cleartext allowed) | Dev only |
| APK (`npm run build:apk`) | `VITE_API_URL` from `web/.env.production` | Baked in |

Remote debugging (`webContentsDebuggingEnabled`) is enabled for non-production builds and disabled in production builds. Mixed content is allowed deliberately (LAN HTTP backends over cleartext).

## Build pipeline

Local: `npm run build:apk` (Vite build → `cap sync android` → `gradlew assembleDebug`) → `web/android/app/build/outputs/apk/debug/app-debug.apk`.

CI (`.github/workflows/build-apk.yml`), on every push to `main`: Node 24 + `npm ci` → Vite build with `NODE_ENV=production` → `cap sync android` → Java 21 (Temurin) + Android SDK 35 → `assembleDebug` → artifact upload (30-day retention). The JS inside is production-optimized even though the APK variant is debug (no keystore needed).

Release signing: supply your own keystore and add `assembleRelease` + signing config under `web/android/app/` (planned as a first-class channel — see [status](STATUS.md)).

## On-device behavior

- **Storage** — downloads and the library mirror live in Capacitor Filesystem; IndexedDB holds state. Storage permissions are requested on first download.
- **Network** — the Capacitor Network plugin drives the offline banner and the offline mutation queue; the app recovers automatically when connectivity returns.
- **Media controls** — Media Session API gives lock-screen play/pause/next/previous and artwork; keyboard-shortcut hooks are inert on touch devices.
- **Keep-awake** — optional screen wake lock during playback (Settings).
- **Splash** — native splash held until the web app signals ready (`launchAutoHide: false`), eliminating the white/black flash on cold start.

## Known limitations

- **iOS is not configured** — the Capacitor project targets Android only.
- **Release channel pending** — CI ships debug APKs; signed release builds are manual.
- **Background playback** follows the WebView lifecycle: audio survives screen-off via the wake lock/media session, but long backgrounded sessions on aggressive OEM battery savers may be killed (a native foreground service is the eventual fix).

## Testing the APK

1. Install the artifact, open the app → landing page renders.
2. Sign in (Clerk) → home populates.
3. Search → play → confirm audio and lock-screen controls.
4. Download a track → airplane mode → play the downloaded track (offline path).
5. Rotate device / background / foreground → state persists, no splash loop.

---

*Last verified against `main`: 2026-09-10 (v2.16.5).*
