/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import {
    CacheFirst,
    NetworkFirst,
    StaleWhileRevalidate,
} from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { RangeRequestsPlugin } from "workbox-range-requests";
import { BackgroundSyncPlugin } from "workbox-background-sync";

declare let self: ServiceWorkerGlobalScope;

// ── Lifecycle ─────────────────────────────────────────────────
// Take control immediately on activation — no waiting for the user
// to close and reopen every tab before the new SW takes effect.

self.skipWaiting();
clientsClaim();

// ── Precache ──────────────────────────────────────────────────
// vite-plugin-pwa injects __WB_MANIFEST at build time — this is the
// list of all hashed JS/CSS/HTML/font files from the Vite build output.
// Precaching means the entire app shell loads without any network
// on subsequent visits.

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Cache names ───────────────────────────────────────────────

const CACHE = {
    ARTWORK: "rheoson-artwork-v2",
    AUDIO: "rheoson-audio-v2",
    API: "rheoson-api-v2",
    SEARCH: "rheoson-search-v1",
    METADATA: "rheoson-metadata-v1",
    FONTS: "rheoson-fonts-v1",
    OFFLINE: "rheoson-offline-v1",
} as const;

// ── Fonts ─────────────────────────────────────────────────────
// Google Fonts — CacheFirst, 1 year.
// Plus Jakarta Sans and DM Sans are used across the whole UI.
// Once cached, they never touch the network again.

registerRoute(
    ({ url }) =>
        url.origin === "https://fonts.googleapis.com" ||
        url.origin === "https://fonts.gstatic.com",
    new CacheFirst({
        cacheName: CACHE.FONTS,
        plugins: [
            new CacheableResponsePlugin({ statuses: [0, 200] }),
            new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 365 }),
        ],
    })
);

// ── Album artwork + artist images ─────────────────────────────
// Artwork is fetched from the Rheoson API (/api/stream/{id}/artwork)
// and from YouTube's thumbnail CDN.
//
// Strategy: CacheFirst — artwork never changes for a given track ID.
// We keep the 500 most recently accessed images, max 30 days.
// This is the primary driver of offline visual completeness — every
// track the user has viewed will have its artwork available offline.

registerRoute(
    ({ url, request }) =>
        request.destination === "image" ||
        (url.pathname.includes("/stream/") &&
            url.pathname.includes("/artwork")) ||
        url.hostname.includes("ytimg.com") ||
        url.hostname.includes("lh3.googleusercontent.com") ||
        url.hostname.includes("i.scdn.co"),
    new CacheFirst({
        cacheName: CACHE.ARTWORK,
        plugins: [
            new CacheableResponsePlugin({ statuses: [0, 200] }),
            new ExpirationPlugin({
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                purgeOnQuotaError: true,
            }),
        ],
    })
);

// ── Audio streaming ────────────────────────────────────────────
// /api/stream/{id}/audio
//
// This is the most important offline route. Downloaded tracks are served
// from the FastAPI backend as local files with HTTP range support.
// The service worker caches them using CacheFirst + RangeRequestsPlugin
// so they play offline even when the backend is unreachable.
//
// RangeRequestsPlugin is critical here: Howler.js (html5: true) sends
// Range: bytes=0- on its first request. Without this plugin, Workbox
// would try to serve the full cached response to a range request, which
// causes a 206/200 mismatch and playback failure.
//
// We only cache responses that come back as 200 (full file) or 206
// (partial, which RangeRequestsPlugin handles). Non-downloaded tracks
// that stream from yt-dlp come through as chunked Transfer-Encoding
// with no Content-Length — those are NOT cached here because the full
// file is never received as a single cacheable unit.
//
// Max 200 audio files, 90 days. On quota error, oldest files are purged.

registerRoute(
    ({ url }) =>
        url.pathname.includes("/stream/") &&
        url.pathname.includes("/audio"),
    new CacheFirst({
        cacheName: CACHE.AUDIO,
        plugins: [
            new CacheableResponsePlugin({ statuses: [200, 206] }),
            new RangeRequestsPlugin(),
            new ExpirationPlugin({
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
                purgeOnQuotaError: true,
            }),
        ],
    })
);

// ── Track/playlist metadata (long-lived cache) ─────────────────
// /api/tracks, /api/tracks/{id}, /api/tracks/liked, /api/playlists,
// /api/playlists/{id}, /api/tracks/recently-played, /api/library/*
//
// These endpoints return structured JSON that rarely changes.
// Strategy: NetworkFirst with long cache TTL — try the server first,
// but the cached version is always available offline.
//
// This is the foundation of offline library browsing: track metadata,
// liked songs, playlists, and recently-played are all served from cache.

registerRoute(
    ({ url }) => {
        const p = url.pathname;
        return (
            p.startsWith("/api/") &&
            !p.includes("/stream/") &&
            !p.includes("/downloads") &&
            !p.includes("/search") &&
            !p.includes("/lyrics") &&
            !p.includes("/settings") &&
            !p.includes("/socket.io") &&
            !p.includes("/health") &&
            !p.includes("/auth/")
        );
    },
    new NetworkFirst({
        cacheName: CACHE.METADATA,
        networkTimeoutSeconds: 3,
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] }),
            new ExpirationPlugin({
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
                purgeOnQuotaError: true,
            }),
        ],
    })
);

// ── Search results ─────────────────────────────────────────────
// /api/search?q=...
//
// Strategy: NetworkFirst — always try the server first.
// Falls back to cached results when offline.
// Caches up to 50 recent search queries, 1 day expiry.
// This lets users browse recent search results offline.

registerRoute(
    ({ url }) => url.pathname.includes("/api/search") && url.searchParams.has("q"),
    new NetworkFirst({
        cacheName: CACHE.SEARCH,
        networkTimeoutSeconds: 3,
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] }),
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
            }),
        ],
    })
);

// ── Generic API fallback (everything else) ─────────────────────
// Catches remaining /api/* requests not matched above.
// Strategy: NetworkFirst with short cache — try server, fall back.
// Covers: /api/health, /api/lyrics, /api/settings, etc.

registerRoute(
    ({ url }) => url.pathname.startsWith("/api/"),
    new NetworkFirst({
        cacheName: CACHE.API,
        networkTimeoutSeconds: 5,
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] }),
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5 minutes
            }),
        ],
    })
);

// ── Background sync for ALL queued mutations ────────────────────
// Any failed POST/PUT/DELETE/PATCH to /api/* (except /stream and
// /downloads) gets retried automatically by Workbox BackgroundSync.
//
// This pairs with the offlineQueue.ts in the main thread:
//   1. Main thread catches the network error, queues in IndexedDB
//   2. SW catches the same request via BackgroundSync, retries later
//   3. On success, the response is forwarded to the client
//
// maxRetentionTime: 24 hours — mutations are retried for up to 24h.

const mutationSync = new BackgroundSyncPlugin("rheoson-mutations", {
    maxRetentionTime: 60 * 24, // 24 hours in minutes
});

registerRoute(
    ({ url, request }) => {
        const p = url.pathname;
        const method = request.method;
        return (
            p.startsWith("/api/") &&
            !p.includes("/stream/") &&
            !p.includes("/downloads") &&
            !p.includes("/socket.io") &&
            (method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH")
        );
    },
    new NetworkFirst({
        cacheName: CACHE.API,
        plugins: [mutationSync],
    }),
    "POST"
);

registerRoute(
    ({ url, request }) => {
        const p = url.pathname;
        const method = request.method;
        return (
            p.startsWith("/api/") &&
            !p.includes("/stream/") &&
            !p.includes("/downloads") &&
            !p.includes("/socket.io") &&
            (method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH")
        );
    },
    new NetworkFirst({
        cacheName: CACHE.API,
        plugins: [mutationSync],
    }),
    "PUT"
);

registerRoute(
    ({ url, request }) => {
        const p = url.pathname;
        const method = request.method;
        return (
            p.startsWith("/api/") &&
            !p.includes("/stream/") &&
            !p.includes("/downloads") &&
            !p.includes("/socket.io") &&
            (method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH")
        );
    },
    new NetworkFirst({
        cacheName: CACHE.API,
        plugins: [mutationSync],
    }),
    "DELETE"
);

registerRoute(
    ({ url, request }) => {
        const p = url.pathname;
        const method = request.method;
        return (
            p.startsWith("/api/") &&
            !p.includes("/stream/") &&
            !p.includes("/downloads") &&
            !p.includes("/socket.io") &&
            (method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH")
        );
    },
    new NetworkFirst({
        cacheName: CACHE.API,
        plugins: [mutationSync],
    }),
    "PATCH"
);

// ── Skip yt-dlp streaming routes ────────────────────────────────
// yt-dlp streams are chunked Transfer-Encoding with no Content-Length.
// They are not cacheable and should never be intercepted by the SW —
// pass them straight to the network. If this route is omitted, the
// browser may buffer the entire stream before forwarding it to Howler,
// which adds several seconds of latency before the first audio byte.

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Let yt-dlp streaming pass through untouched
    if (
        url.pathname.includes("/stream/") &&
        url.pathname.includes("/audio") &&
        event.request.headers.get("Transfer-Encoding") === "chunked"
    ) {
        return; // browser handles it natively
    }
});

// ── Socket.IO ─────────────────────────────────────────────────
// Socket.IO uses polling as a fallback and its own URL structure.
// Never intercept WebSocket upgrades or Socket.IO polling requests.

registerRoute(
    ({ url }) => url.pathname.startsWith("/socket.io"),
    new NetworkFirst({ cacheName: "rheoson-socketio-v1" })
);

// ── Offline fallback ──────────────────────────────────────────
// When a navigation request (page load) fails — e.g. the user opens
// Rheoson while fully offline and the SW cache is cold — serve the
// precached index.html. The app shell is always in the precache, so
// this will always succeed. React Router handles the rest client-side.

setCatchHandler(async ({ request }) => {
    if (request.destination === "document") {
        const precache = await caches.open("workbox-precache-v2");
        const index =
            (await precache.match("/index.html")) ??
            (await precache.match("/"));
        if (index) return index;

        // Last resort — try the offline cache
        const offlineCache = await caches.open(CACHE.OFFLINE);
        const cached = await offlineCache.match("/");
        if (cached) return cached;
    }

    // For API requests, return a proper offline JSON response
    if (request.url.includes("/api/")) {
        return new Response(
            JSON.stringify({
                error: "offline",
                message: "You are offline. Data will sync when connection is restored.",
            }),
            {
                status: 503,
                headers: { "Content-Type": "application/json" },
            }
        );
    }

    return Response.error();
});

// ── Push notifications ────────────────────────────────────────
// Wired but no-op until the backend sends push events.
// Kept here so the permission flow can be added without touching the SW.

self.addEventListener("push", (event) => {
    if (!event.data) return;
    try {
        const data = event.data.json() as {
            title?: string;
            body?: string;
            icon?: string;
            badge?: string;
            tag?: string;
            data?: Record<string, unknown>;
        };
        const options: NotificationOptions = {
            body: data.body ?? "",
            icon: data.icon ?? "/icon-192.png",
            badge: data.badge ?? "/icon-192.png",
            tag: data.tag ?? "Rheoson",
            data: data.data ?? {},
        };
        event.waitUntil(
            self.registration.showNotification(
                data.title ?? "Rheoson",
                options
            )
        );
    } catch {
        // Malformed push payload — silently ignore
    }
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients
            .matchAll({ type: "window" })
            .then((clients) => {
                const focused = clients.find((c) => "focus" in c && c.focus);
                if (focused) return focused.focus();
                return self.clients.openWindow("/");
            })
    );
});

// ── Message handler ────────────────────────────────────────────
// The main thread can send messages to the SW to trigger actions
// like cache invalidation or sync.

self.addEventListener("message", (event) => {
    const { type } = event.data;

    switch (type) {
        case "SKIP_WAITING":
            self.skipWaiting();
            break;

        case "CLEAR_API_CACHE":
            caches.delete(CACHE.API).then(() => {
                console.debug("[SW] API cache cleared");
            });
            break;

        case "CLEAR_SEARCH_CACHE":
            caches.delete(CACHE.SEARCH).then(() => {
                console.debug("[SW] Search cache cleared");
            });
            break;

        case "CLEAR_ALL_CACHES":
            Promise.all([
                caches.delete(CACHE.API),
                caches.delete(CACHE.ARTWORK),
                caches.delete(CACHE.AUDIO),
                caches.delete(CACHE.SEARCH),
                caches.delete(CACHE.METADATA),
                caches.delete(CACHE.OFFLINE),
            ]).then(() => {
                console.debug("[SW] All caches cleared");
            });
            break;

        case "GET_CACHE_STATS":
            Promise.all([
                caches.open(CACHE.API),
                caches.open(CACHE.ARTWORK),
                caches.open(CACHE.AUDIO),
                caches.open(CACHE.SEARCH),
                caches.open(CACHE.METADATA),
            ]).then(async ([api, artwork, audio, search, metadata]) => {
                const stats = {
                    api: (await api.keys()).length,
                    artwork: (await artwork.keys()).length,
                    audio: (await audio.keys()).length,
                    search: (await search.keys()).length,
                    metadata: (await metadata.keys()).length,
                };
                // Send stats back to client
                const clients = await self.clients.matchAll();
                clients.forEach((client) => {
                    client.postMessage({
                        type: "CACHE_STATS",
                        stats,
                    });
                });
            });
            break;
    }
});
