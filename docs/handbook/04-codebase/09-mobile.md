# Chapter 12 — Mobile: Capacitor and Android

*Part III · The Codebase*

---

The Android app is not a second codebase. It is the web build loaded into a native shell that provides what a browser page lacks: an icon on a home screen, full-screen audio control, foreground services, and a file system to install into. **Capacitor** is that shell. This chapter covers the shell's anatomy, the bridge between web and native code, the Android-specific configuration that has real failure modes, and the pipeline that turns `web/dist` into an installable APK.

## 12.1 The shell's anatomy

```
web/
├── capacitor.config.ts          # the shell's configuration — read at sync/build time
├── android/                     # the native project (Gradle, manifest, Java, icons)
│   ├── app/build.gradle         # SDK levels, versionCode, signing
│   └── app/src/main/
│       ├── AndroidManifest.xml  # permissions, service registration
│       ├── java/com/lethabo/rheoson/
│       │   ├── MainActivity.java
│       │   ├── DownloadForegroundPlugin.java   # bridge: JS ↔ service
│       │   └── DownloadForegroundService.java  # keeps downloads alive
│       └── res/                 # launcher icons, splash, strings
└── scripts/generate-android-icons.sh   # logo.png → every icon density
```

`capacitor.config.ts` is the file to read first. Its settings are not decoration:

| Setting | Value | Why it is load-bearing |
|---|---|---|
| `appId` | `com.lethabo.rheoson` | the Android identity — changing it makes a *different app* on every device |
| `allowMixedContent` | `true` | a self-hosted backend is plain HTTP; a strict shell would refuse it |
| `webContentsDebuggingEnabled` | `!isProd` | Chrome DevTools can inspect the WebView in dev builds |
| `SplashScreen.launchAutoHide` | `false` | the app hides the splash itself once React is ready — no white flash |
| server.url (dev) | `RHEOSON_DEV_URL` | dev builds load from a LAN dev server instead of bundled assets |

## 12.2 The bridge: plugins and the foreground service

Capacitor's bridge exposes native code to JavaScript as *plugins*. The app ships one custom pair, and it exists because of an operating-system behavior worth understanding: when an Android app leaves the foreground, the OS is permitted to suspend and kill its processes — including the WebView running a download queue. A **foreground service** is the OS's sanctioned answer: a service marked as user-visible work (with a persistent notification) that the system will not kill.

```
JS (download page)                Native (Android)
  DownloadForeground.start()  →    plugin validates → startForegroundService()
                                   service shows the progress notification
  (WebView may be suspended;       the native service keeps the OS from
   the backend keeps downloading)  reclaiming the process
  DownloadForeground.stop()   →    plugin → stop the service, drop the notification
```

Two rules from this codebase's own crash history make the native side non-obvious. First, *every* plugin method must catch its own exceptions — an exception escaping into the bridge kills the app (a `try/catch` with an error callback wraps each method). Second, service lifecycle calls differ by Android version: starting and stopping a foreground service from the background is restricted on Android 12+, and the service checks its own state before stopping rather than assuming it was started. Both fixes are in `DownloadForegroundService.java`/`DownloadForegroundPlugin.java` with comments explaining the OS constraint — the native files are short and worth reading in full once.

The manifest registers the service and declares the permissions the app actually uses (`INTERNET`, notification, foreground-service types). Permissions not in the manifest do not exist; permissions in the manifest that nothing uses are review findings — each one is a user-approval cost and a store-review question.

## 12.3 The WebView's environment quirks

The JS running in the shell is ordinary React, but the *environment* differs from a browser in ways that shape code:

**Origin and the API target.** The shell serves the bundle from its own origin; there is no dev proxy. The API base URL must therefore be absolute at build time — Chapter 3.7's rule with teeth here: the build verifies it (12.4), and the "HTML instead of JSON" bug class came from exactly this being wrong.

**Audio.** `html5: true` in Howler (11.2) is an Android requirement, not a preference — Web Audio decoding of large files is unreliable in the WebView, and the native `<audio>` element supports the range requests seeking needs.

**Media Session.** The lock-screen controls and metadata come from the Media Session API (`hooks/mediaSession.hook.ts`), which the WebView implements — cover art and pause/play on the lock screen are web-standard calls, no plugin needed.

**Offline behavior.** The service worker (12.4) runs inside the WebView, so cached artwork and audio work identically to the PWA in a browser.

**Back button and status bar.** The hardware back gesture maps to history navigation; the status bar's color is synced to the current album art (`lib/statusbar.ts`) — small glue files whose absence is immediately visible.

## 12.4 Build pipeline: dist → APK

```
npm run build            # tsc + Vite → dist/, env baked in, verify-gate runs
npx cap sync android     # copy dist/ into the native project, update plugins
gradle assembleDebug     # (or the release path) → app-debug.apk
```

Two quality gates live in that first step. The **verify gate** fails the build if the bundle's API origin is missing or relative — the CI guard that made the HTML-instead-of-JSON bug unshippable. The **icon pipeline** is scripted (`scripts/generate-android-icons.sh`): one master (`web/public/assets/logo.png`) generates every launcher density, the splash, and the notification silhouette, so rebranding is one file and one command rather than six hand-edited images. Release builds are signed with a keystore that is *never* committed; CI builds debug APKs from `main` via GitHub Actions (Chapter 18.4).

**In-place updates.** The app updates by installing a higher-`versionCode` APK with the same `appId` — no uninstall, data preserved. The update flow (version check against the backend, banner with the APK link) depends on that invariant, which is why `appId` and version bumps are release-process steps (17.9), not casual edits.

## 12.5 The PWA twin

The same build also deploys as a Progressive Web App, and the two faces share everything except the shell:

| Concern | APK (Capacitor) | PWA (browser) |
|---|---|---|
| Install | APK sideload / store | browser "install" prompt |
| Updates | rebuild + reinstall (12.4) | service worker auto-update |
| Offline | service worker + durable cache | same |
| Background audio | WebView + Media Session | same, while tab lives |
| Downloads surviving background | foreground service | browser may throttle |

The service worker's strategies (`web/src/sw.ts`, Workbox `injectManifest`) are the offline engine for both: cache-first with range support for audio and artwork (bounded, 30-day artwork TTL), network-first for API responses with an offline fallback, stale-while-revalidate for the app shell. Dev mode disables the worker entirely — it fights hot reload — which explains the "offline behavior differs in dev" reports.

## 12.6 Debugging the shell

The toolchain when the device misbehaves: `chrome://inspect` attaches DevTools to the WebView (dev builds only — the config above); `adb logcat` shows native logs including plugin errors and service crashes; `adb install -r` reinstalls without data loss. The Division of labor for a device-only bug: reproduce in browser first — what survives is shell-specific (bridge, service, manifest); what does not is ordinary frontend debugging (Chapter 15). Most "app crashes" in this project's history were frontend exceptions the shell faithfully rendered; the bridge ones had Java stack traces in logcat.

## Exercises

1. The team renames `appId` to rebrand. List three user-visible consequences beyond "new name."
2. A download completes while the phone screen is off, then the app crashes. Using 12.2, name the two native-side guards that should have fired, then check the Java for them.
3. Explain to a Chapter 3 reader why the APK build cannot rely on a Vite proxy, and what the verify gate does about it.
4. Run the icon generator on the current `logo.png` (in a scratch checkout) and list every file it touches. Which densities would a designer's hand-edited icon have missed?
5. The PWA and APK show different update flows for the same release. Explain why using 12.4's table, and which invariant keeps the APK flow safe.
