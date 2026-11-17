import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev requests stay same-origin through this proxy, so the browser never sees
// the worker origin and CORS behaves the way it will in production.
// 8787 is wrangler's default port.
const API_TARGET = process.env.RHEOSON_API_TARGET ?? 'http://127.0.0.1:8787'

// Preview and tunnel hostnames change between sessions, so they arrive from the
// environment rather than living in this file: a tracked hostname goes stale and
// ships to every other checkout. Empty means localhost only.
const ALLOWED_HOSTS = (process.env.RHEOSON_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: ALLOWED_HOSTS,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
})
