import { CapacitorConfig } from "@capacitor/cli";

const isProd = process.env.NODE_ENV === "production";

// For APK dev builds against your local Termux backend:
//   RHEOSON_DEV_URL=http://192.168.1.XX:3000 npx cap run android
//
// For a release APK against the prod Render backend:
//   NODE_ENV=production npx cap build android
//   (VITE_API_URL in .env.production handles the API URL)

const config: CapacitorConfig = {
   appId: "com.lethabo.rheoson",
   appName: "Rheoson",
   webDir: "dist",

   // ── Server ─────────────────────────────────────────────────
   // Dev: point WebView at Vite dev server (hot-reload on device)
   // Prod: load from bundled dist/ — VITE_API_URL in .env.production
   //       sets the API base that gets baked into the JS bundle
   ...(!isProd && process.env.RHEOSON_DEV_URL
      ? { server: { url: process.env.RHEOSON_DEV_URL, cleartext: true } }
      : {}),

   android: {
      // Allow the WebView to call both HTTP (local Termux, LAN dev)
      // and HTTPS (Render prod) without mixed-content errors.
      allowMixedContent: true,

      captureInput: true,

      // Disable remote debugging in production APK builds
      webContentsDebuggingEnabled: !isProd,

      backgroundColor: "#0A0A0A"
   },

   plugins: {
      SplashScreen: {
         launchAutoHide: false,
         backgroundColor: "#0A0A0A",
         androidSplashResourceName: "splash",
         showSpinner: false
      },

      LocalNotifications: {
         smallIcon: "ic_stat_icon_config_sample",
         iconColor: "#E5193A",
         sound: "rhea.mp3"
      },

      // CapacitorHttp replaces fetch() with a native HTTP client.
      // This fixes CORS issues when the WebView calls the local
      // Termux backend on 127.0.0.1 — the native client bypasses
      // WebView CORS enforcement entirely.
      CapacitorHttp: {
         enabled: true
      }
   }
};

export default config;
