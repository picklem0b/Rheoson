import { CapacitorConfig } from "@capacitor/cli";

const isProd = process.env.NODE_ENV === "production";

const config: CapacitorConfig = {
    appId: "com.lethabo.shulker",
    appName: "Shulker",
    webDir: "dist",

    // ── Server ────────────────────────────────────────────────
    // In development the WebView points at the Vite dev server on the
    // local machine so hot-reload works on device.
    // In production the WebView loads from the bundled dist/ folder.
    //
    // SHULKER_DEV_URL can be set to your machine's LAN IP, e.g.:
    //   SHULKER_DEV_URL=http://192.168.1.10:3000 npx cap run android
    //
    // When unset in dev, Capacitor falls back to the bundled web assets.
    ...(!isProd && process.env.SHULKER_DEV_URL
        ? {
              server: {
                  url: process.env.SHULKER_DEV_URL,
                  cleartext: true // allow HTTP on LAN
              }
          }
        : {}),

    android: {
        // Allow the WebView to load both HTTP (local API on Termux) and
        // HTTPS (Render deployment) without throwing mixed-content errors.
        // Required because Termux runs HTTP on 127.0.0.1:8000.
        allowMixedContent: true,

        // Capture text input correctly in the WebView — needed for the
        // search bar and settings inputs to behave like native inputs.
        captureInput: true,

        // Disable remote debugging in production builds.
        // Set to true if you need to inspect the WebView via Chrome DevTools.
        webContentsDebuggingEnabled: !isProd,

        // Back button on Android dismisses the Now Playing sheet / modals
        // before exiting the app. Handled in App.tsx via the hardware back
        // button listener from @capacitor/app when that plugin is wired up.
        backgroundColor: "#0A0A0A"
    },

    // ── Plugins ───────────────────────────────────────────────
    plugins: {
        // SplashScreen — matches the app's dark background and logo.
        // Config here is read by @capacitor/splash-screen if/when added.
        SplashScreen: {
            launchAutoHide: false, // we dismiss it manually from SplashScreen.tsx
            backgroundColor: "#0A0A0A",
            androidSplashResourceName: "splash",
            showSpinner: false
        },

        // LocalNotifications — used by the download completion notification
        // and (future) push notifications. Declare here so the plugin
        // generates the correct AndroidManifest.xml entries.
        LocalNotifications: {
            smallIcon: "ic_stat_icon_config_sample",
            iconColor: "#E5193A",
            sound: "rhea.mp3"
        },

        // CapacitorHttp — replaces fetch() in the WebView with a native
        // HTTP client that correctly handles cookies and avoids CORS issues
        // when talking to the local Termux backend on 127.0.0.1.
        CapacitorHttp: {
            enabled: true
        }
    }
};

export default config;
