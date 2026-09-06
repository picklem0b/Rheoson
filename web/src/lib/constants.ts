// ── Environment detection ─────────────────────────────────────
//
// Three runtime environments:
//   1. Dev (npm run dev)      — Vite proxy forwards /api → localhost:8000
//   2. Prod web (Render)      — VITE_API_URL must be set in Render env vars
//   3. APK (Capacitor build)  — VITE_API_URL baked in at build time,
//                               Capacitor CapacitorHttp handles CORS natively
//
// VITE_API_URL must be the bare origin with no trailing slash:
//   https://rheoson-api-vnny.onrender.com
//
// For the APK build, set it in web/.env.production before running:
//   npm run build && npx cap sync

const PROD_API_ORIGIN =
   import.meta.env.VITE_API_URL ?? "https://rheoson-api-vnny.onrender.com";

// ── API_BASE ──────────────────────────────────────────────────
// Used by the api client (client.api.ts) for all REST requests.
//
// Dev:      /api          → Vite proxy → http://127.0.0.1:8000/api
// Prod/APK: https://rheoson-api-vnny.onrender.com/api
//
// FIX: Use import.meta.env.DEV (set by Vite) for accurate detection.
// Previously used import.meta.env.PROD which could be stale.
export const API_BASE = (import.meta.env.DEV) ? "/api" : `${PROD_API_ORIGIN}/api`;

// ── WS_URL ────────────────────────────────────────────────────
// Used by websocket.lib.ts for the Socket.IO connection.
// Socket.IO io() takes the ORIGIN, not the /api path — this was
// the root cause of the APK WebSocket connection failure.
//
// Dev:      http://127.0.0.1:8000   (direct — no Vite proxy for WS in all cases)
// Prod/APK: https://rheoson-api-vnny.onrender.com
//
export const WS_URL = (import.meta.env.DEV)
   ? (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000")
   : PROD_API_ORIGIN;

// ── Endpoints ─────────────────────────────────────────────────

export const ENDPOINTS = {
   health: `${API_BASE}/health`,
   search: (q: string, filter?: string) =>
      `${API_BASE}/search?q=${encodeURIComponent(q)}${filter ? `&filter=${filter}` : ""}`,
   resolve: `${API_BASE}/search/resolve`,
   tracks: `${API_BASE}/tracks`,
   track: (id: string) => `${API_BASE}/tracks/${id}`,
   stream: (id: string) => `${API_BASE}/stream/${id}/audio`,
   artwork: (id: string) => `${API_BASE}/stream/${id}/artwork`,
   like: (id: string) => `${API_BASE}/tracks/${id}/like`,
   play: (id: string) => `${API_BASE}/tracks/${id}/play`,
   liked: `${API_BASE}/tracks/liked`,
   recentlyPlayed: `${API_BASE}/tracks/recently-played`,
   downloads: `${API_BASE}/downloads`,
   download: (id: string) => `${API_BASE}/downloads/${id}`,
   downloadCancel: (id: string) => `${API_BASE}/downloads/${id}/cancel`,
   downloadRetry: (id: string) => `${API_BASE}/downloads/${id}/retry`,
   playlists: `${API_BASE}/playlists`,
   playlist: (id: string) => `${API_BASE}/playlists/${id}`,
   playlistTracks: (id: string) => `${API_BASE}/playlists/${id}/tracks`,
   importPlaylist: (id: string) => `${API_BASE}/playlists/${id}/import`,
   lyrics: (id: string, title?: string, artist?: string) =>
      `${API_BASE}/lyrics/${id}?title=${encodeURIComponent(title ?? "")}&artist=${encodeURIComponent(artist ?? "")}`
} as const;

export const PLAYER_DEFAULTS = {
   volume: 0.8,
   seekStep: 10
} as const;

export const DOWNLOAD_DEFAULTS = {
   format: "mp3" as const,
   quality: "320" as const,
   embedArtwork: true,
   embedLyrics: true
} as const;

export const BREAKPOINTS = {
   sm: 640,
   md: 768,
   lg: 1024,
   xl: 1280
} as const;

export const STORAGE_KEYS = {
   theme: "rheoson-theme",
   volume: "rheoson-volume",
   queue: "rheoson-queue",
   liked: "rheoson-liked",
   user: "rheoson-user"
} as const;

export const APP_NAME = "Rheoson";
export const APP_VERSION = "2.11.0";

// ── Clerk ────────────────────────────────────────────────────
// Publishable key for Clerk auth. Must be set in .env (VITE_CLERK_PUBLISHABLE_KEY).
// When empty, auth features are disabled — the app works in local-only mode.
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";

// ── Artwork proxy ────────────────────────────────────────────
// Routes YouTube/Spotify CDN artwork through the API server to avoid
// CORS issues on the APK and rate limiting on Render's free tier.
// Local /api/stream/* URLs pass through unchanged.
export function artworkUrl(trackId: string, remoteUrl?: string): string {
  if (!remoteUrl) return ''
  // If the URL is already a local API path, return as-is
  if (remoteUrl.startsWith('/api/')) return remoteUrl
  // Proxy remote URLs through the API server
  return `${API_BASE}/stream/${trackId}/artwork-proxy?url=${encodeURIComponent(remoteUrl)}`
}
