// ── Environment detection ─────────────────────────────────────
//
// Three runtime environments:
//   1. Dev (npm run dev)      — Vite proxy forwards /api → localhost:8000
//   2. Prod web (Render/VPS)  — VITE_API_URL, or same-origin behind nginx
//   3. APK (Capacitor build)  — an ABSOLUTE VITE_API_URL is mandatory:
//                               there is no proxy inside the WebView, so a
//                               relative /api would resolve against the
//                               bundled assets and return index.html.
//
// VITE_API_URL must be the bare origin with no trailing slash:
//   https://rheoson-api-9e4c.onrender.com
// Special value "" (explicitly empty) = same-origin deployment: nginx
// reverse-proxies /api and /socket.io on the same domain that serves the
// SPA (see docker-compose.vps.yml). That only makes sense in a browser —
// see the native guard below.

import {
   CANONICAL_API_ORIGIN,
   resolveApiTarget,
   apiBaseFor,
   wsUrlFor,
} from "./apiTarget";

export { CANONICAL_API_ORIGIN };

const RAW_API_URL: string | undefined = import.meta.env.VITE_API_URL;

/** True inside the Capacitor native shell (Android/iOS). */
const IS_NATIVE =
   typeof window !== "undefined" &&
   !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

const PAGE_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";
const BUILD_DEV = import.meta.env.DEV;

// The decision itself lives in a pure, unit-tested function — see apiTarget.ts
// for why this must never silently become a relative path.
const TARGET = resolveApiTarget({
   rawApiUrl: RAW_API_URL,
   isDev: BUILD_DEV,
   isNative: IS_NATIVE,
   pageOrigin: PAGE_ORIGIN,
});

/** Where this build thinks the API lives — surfaced in Settings → Doctor. */
export function describeApiTarget() {
   return {
      source: TARGET.source,
      origin: TARGET.origin || PAGE_ORIGIN,
      apiBase: API_BASE,
      native: IS_NATIVE,
   };
}

if (TARGET.source === "canonical-fallback" && typeof console !== "undefined") {
   console.warn(
      `[rheoson] No absolute VITE_API_URL was baked into this build; ` +
         `falling back to ${CANONICAL_API_ORIGIN}. ` +
         `Native builds must set VITE_API_URL in web/.env.production.`,
   );
}

// ── API_BASE ──────────────────────────────────────────────────
// Used by the api client (client.api.ts) for all REST requests.
//
// Dev:      /api          → Vite proxy → http://127.0.0.1:8000/api
// Prod/APK: https://rheoson-api-9e4c.onrender.com/api
export const API_BASE = apiBaseFor(TARGET);

// ── WS_URL ────────────────────────────────────────────────────
// Used by websocket.lib.ts for the Socket.IO connection.
// Socket.IO io() takes the ORIGIN, not the /api path — passing the path was
// the root cause of the APK's socket connection failure. An empty string
// tells Socket.IO to use the page origin (the proxied dev case).
export const WS_URL = wsUrlFor(TARGET, PAGE_ORIGIN);

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
export const APP_VERSION = "2.17.8";

// ── Clerk ────────────────────────────────────────────────────
// Publishable key for Clerk auth. Must be set in .env (VITE_CLERK_PUBLISHABLE_KEY).
// When empty, auth features are disabled — the app works in local-only mode.
export const CLERK_PUBLISHABLE_KEY = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "").trim();

/**
 * A publishable key always looks like `pk_test_…` / `pk_live_…`.
 *
 * This is not cosmetic validation. `CLERK_PUBLISHABLE_KEY` is the app's
 * "is auth configured?" switch: when it is truthy we mount <ClerkProvider>
 * and render every component that calls useUser()/useAuth(). A *truthy but
 * invalid* value — a pasted secret key, a stray quote, a placeholder — makes
 * Clerk's provider refuse to establish its context while those components
 * still render, and each one throws "useUser can only be used within the
 * <ClerkProvider /> component", which react-router escalates to a full-page
 * error. That is the crash captured in web/app.err.
 *
 * Validating the shape means a bad value degrades to local mode instead of
 * taking a route (or the whole shell) down.
 */
const CLERK_KEY_PATTERN = /^pk_(test|live)_[A-Za-z0-9_$+/=-]{8,}$/;

/**
 * Mutable on purpose: if Clerk is configured correctly but fails at runtime
 * (script blocked, network dropped, revoked instance), the crash guard flips
 * this off and the app keeps working in local mode instead of white-screening.
 * Read it through `isClerkEnabled()` so a flip is honoured on the next render.
 */
export const clerkRuntime = { enabled: CLERK_KEY_PATTERN.test(CLERK_PUBLISHABLE_KEY) };

/** True when Clerk auth should be mounted for this render. */
export function isClerkEnabled(): boolean {
   return clerkRuntime.enabled;
}

/** Degrade to local mode after a runtime Clerk failure. */
export function disableClerkRuntime(): void {
   clerkRuntime.enabled = false;
}

if (CLERK_PUBLISHABLE_KEY && !clerkRuntime.enabled && typeof console !== "undefined") {
   console.warn(
      "[rheoson] VITE_CLERK_PUBLISHABLE_KEY is set but is not a valid publishable key " +
         "(pk_test_… / pk_live_…). Continuing in local mode.",
   );
}

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
