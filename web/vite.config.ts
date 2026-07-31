import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),

        VitePWA({
            // injectManifest lets us own sw.ts completely — we write the caching
            // logic, Workbox just injects __WB_MANIFEST (the precache list) at
            // build time. The alternative (generateSW) would overwrite our sw.ts.
            registerType: 'autoUpdate',
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',

            // Static assets to include in the precache alongside the build output
            includeAssets: [
                'favicon.ico',
                'icon-192.png',
                'icon-512.png',
                'assets/logo.png',
                'assets/rhea.mp3' // download completion sound
            ],

            manifest: {
                name: 'Shulker',
                short_name: 'Shulker',
                description:
                    'Self-hosted music streaming and download. No subscription, no ads.',
                theme_color: '#0A0A0A',
                background_color: '#0A0A0A',
                display: 'standalone',
                orientation: 'portrait',
                scope: '/',
                start_url: '/',
                lang: 'en',
                categories: ['music', 'entertainment'],
                icons: [
                    {
                        src: 'icon-192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ],
                // Media session action handlers are wired in useMediaSession.ts.
                // Declaring the media feature here signals to Android Chrome that
                // this app uses the Media Session API.
                shortcuts: [
                    {
                        name: 'Downloads',
                        short_name: 'Downloads',
                        url: '/downloads',
                        icons: [{ src: 'icon-192.png', sizes: '192x192' }]
                    },
                    {
                        name: 'Search',
                        short_name: 'Search',
                        url: '/search',
                        icons: [{ src: 'icon-192.png', sizes: '192x192' }]
                    }
                ]
            },

            injectManifest: {
                // Glob patterns for files that go into the precache manifest.
                // woff2 is included so Plus Jakarta Sans and DM Sans are available
                // offline without hitting Google Fonts (belt-and-suspenders alongside
                // the CacheFirst fonts route in sw.ts).
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,mp3}'],
                // Raise the limit — rhea.mp3 is ~120 KB, some JS chunks can be large.
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5 MB
            },

            // Disable SW in dev — hot module replacement and service workers
            // conflict badly. The SW is only active after `npm run build`.
            devOptions: {
                enabled: false
            }
        })
    ],

    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },

    server: {
        port: 3000,
        host: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true
            },
            '/socket.io': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                ws: true
            }
        }
    },

    build: {
        outDir: 'dist',
        sourcemap: false,
        minify: 'esbuild',
        // Target browsers that support ES2020 — same as tsconfig.
        target: 'es2020',
        rollupOptions: {
            output: {
                manualChunks: {
                    // React core — changes very rarely; long cache lifetime
                    vendor: ['react', 'react-dom', 'react-router-dom'],

                    // Howler is ~50 KB — isolate so audio playback can be lazy-loaded
                    player: ['howler'],

                    // Framer Motion is large (~140 KB gzip) — own chunk
                    motion: ['framer-motion'],

                    // TanStack Query — data fetching layer
                    query: ['@tanstack/react-query'],

                    // Lucide icons — tree-shaken at build time but still isolated
                    icons: ['lucide-react'],

                    // Socket.IO client
                    socket: ['socket.io-client'],

                    // Zustand — tiny but used everywhere; isolate for granular caching
                    state: ['zustand']
                }
            }
        }
    }
});
