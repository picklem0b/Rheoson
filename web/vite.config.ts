import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

const isProd = process.env.NODE_ENV === "production";

export default defineConfig({
   plugins: [
      react(),

      VitePWA({
         registerType: "autoUpdate",
         strategies: "injectManifest",
         srcDir: "src",
         filename: "sw.ts",

         includeAssets: [
            "favicon.ico",
            "icon-192.png",
            "icon-512.png",
            "assets/logo.png",
            "assets/rhea.mp3"
         ],

         manifest: {
            name: "Rheoson",
            short_name: "Rheoson",
            description:
               "Self-hosted music streaming and download. No subscription, no ads.",
            theme_color: "#0A0A0A",
            background_color: "#0A0A0A",
            display: "standalone",
            orientation: "portrait",
            scope: "/",
            start_url: "/",
            lang: "en",
            categories: ["music", "entertainment"],
            icons: [
               { src: "icon-192.png", sizes: "192x192", type: "image/png" },
               {
                  src: "icon-512.png",
                  sizes: "512x512",
                  type: "image/png",
                  purpose: "any maskable"
               }
            ],
            shortcuts: [
               {
                  name: "Downloads",
                  short_name: "Downloads",
                  url: "/downloads",
                  icons: [{ src: "icon-192.png", sizes: "192x192" }]
               },
               {
                  name: "Search",
                  short_name: "Search",
                  url: "/search",
                  icons: [{ src: "icon-192.png", sizes: "192x192" }]
               }
            ]
         },

         injectManifest: {
            globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,mp3}"],
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
         },

         devOptions: { enabled: false }
      })
   ],

   resolve: {
      alias: { "@": path.resolve(__dirname, "./src") }
   },

   // Explicitly set import.meta.env.PROD so constants.ts always gets the
   // right value regardless of how Vite infers the build mode.
   // Without this, running `vite build` inside the GitHub Actions APK job
   // could leave PROD as false if the mode flag isn't passed, which makes
   // API_BASE resolve to '/api' — a relative path that breaks in the APK WebView.
   define: {
      "import.meta.env.PROD": JSON.stringify(isProd),
      "import.meta.env.DEV": JSON.stringify(!isProd)
   },

   server: {
      port: 3000,
      host: true,
      // Dev requests go through this proxy so the browser stays same-origin.
      // Override with RHEOSON_API_TARGET to develop against another backend,
      // e.g.:  RHEOSON_API_TARGET=https://Rheoson-api-vnny.onrender.com npm run dev
      proxy: {
         // FIX: Dev proxy should point to the LOCAL backend, not prod.
         // This was the root cause of "changes only visible in prod" —
         // all dev requests were hitting the Render server.
         "/api": {
            target: process.env.RHEOSON_API_TARGET ?? "http://127.0.0.1:8000",
            changeOrigin: true
         },
         "/socket.io": {
            target: process.env.RHEOSON_API_TARGET ?? "http://127.0.0.1:8000",
            changeOrigin: true,
            ws: true
         }
      }
   },

   build: {
      outDir: "dist",
      sourcemap: false,
      minify: "esbuild",
      target: "es2020",
      rollupOptions: {
         output: {
            manualChunks: {
               vendor: ["react", "react-dom", "react-router-dom"],
               player: ["howler"],
               motion: ["framer-motion"],
               query: ["@tanstack/react-query"],
               icons: ["lucide-react"],
               socket: ["socket.io-client"],
               state: ["zustand"]
            }
         }
      }
   }
});
