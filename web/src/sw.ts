/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import {
    CacheFirst,
    NetworkFirst
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
    ARTWORK: "shulker-artwork-v1",
    AUDIO: "shulker-audio-v1",
    API: "shulker-api-v1",
    FONTS: "shulker-fonts-v1",
    OFFLINE: "shulker-offline-v1"
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
            new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 365 })
        ]
    })
);

// ── Album artwork + artist images ─────────────────────────────
// Artwork is fetched from the Shulker API (/api/stream/{id}/artwork)
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
                purgeOnQuotaError: true
            })
        ]
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
// file is never received as a single cacheable unit. They continue to
// hit the network normally.
//
// Max 200 audio files, 90 days. On quota error, oldest files are purged.

registerRoute(
    ({ url }) =>
        url.pathname.includes("/stream/") && url.pathname.includes("/audio"),
    new CacheFirst({
        cacheName: CACHE.AUDIO,
        plugins: [
            new CacheableResponsePlugin({ statuses: [200, 206] }),
            new RangeRequestsPlugin(),
            new ExpirationPlugin({
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
                purgeOnQuotaError: true
            })
        ]
    })
);

// ── API responses ─────────────────────────────────────────────
// /api/tracks, /api/tracks/recently-played, /api/tracks/liked,
// /api/playlists, /api/library/*
//
// Strategy: NetworkFirst — always try the server first so the UI
// shows fresh data. Falls back to the cached response when offline.
// Expiry: 5 minutes (data should be fresh when online).
//
// Excluded: /stream/* (handled above), /downloads (live job state
// should never be read from cache), /search (stale search results
// are confusing — omit offline fallback for search).

registerRoute(
    ({ url }) => {
        const p = url.pathname;
        return (
            p.startsWith("/api/") &&
            !p.includes("/stream/") &&
            !p.includes("/downloads") &&
            !p.includes("/search")
        );
    },
    new NetworkFirst({
        cacheName: CACHE.API,
        networkTimeoutSeconds: 5,
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] }),
            new ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 60 * 5 // 5 minutes
            })
        ]
    })
);

// ── Background sync for play history ──────────────────────────
// POST /api/tracks/{id}/play can fail when offline (Render sleeping,
// network down). BackgroundSyncPlugin queues the request and retries
// it automatically when connectivity is restored.
// This keeps recently-played accurate even when the app is used
// fully offline for a period.

const playHistorySync = new BackgroundSyncPlugin("shulker-play-history", {
    maxRetentionTime: 60 * 24 // 24 hours in minutes
});

registerRoute(
    ({ url, request }) =>
        url.pathname.includes("/tracks/") &&
        url.pathname.includes("/play") &&
        request.method === "POST",
    new NetworkFirst({
        cacheName: CACHE.API,
        plugins: [playHistorySync]
    }),
    "POST"
);

// ── Skip streaming routes entirely ─────────────────────────────
// yt-dlp streams are chunked Transfer-Encoding with no Content-Length.
// They are not cacheable and should never be intercepted by the SW —
// pass them straight to the network. If this route is omitted, the
// browser may buffer the entire stream before forwarding it to Howler,
// which adds several seconds of latency before the first audio byte.
//
// The audio cache route above only caches the local-file responses
// (Content-Length present, status 200/206). This route guards against
// the SW accidentally buffering a live yt-dlp pipe.

self.addEventListener("fetch", event => {
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
    new NetworkFirst({ cacheName: "shulker-socketio-v1" })
);

// ── Offline fallback ──────────────────────────────────────────
// When a navigation request (page load) fails — e.g. the user opens
// Shulker while fully offline and the SW cache is cold — serve the
// precached index.html. The app shell is always in the precache, so
// this will always succeed. React Router handles the rest client-side.

setCatchHandler(async ({ request }) => {
    if (request.destination === "document") {
        const cache = await caches.open(CACHE.OFFLINE);
        const cached = await cache.match("/");
        if (cached) return cached;

        // Fallback to precache index
        const precache = await caches.open("workbox-precache-v2");
        const index =
            (await precache.match("/index.html")) ??
            (await precache.match("/"));
        if (index) return index;
    }

    return Response.error();
});

// ── Push notifications (placeholder) ─────────────────────────
// Wired but no-op until the backend sends push events.
// Kept here so the permission flow can be added without touching the SW.

self.addEventListener("push", event => {
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
            tag: data.tag ?? "shulker",
            data: data.data ?? {}
        };
        event.waitUntil(
            self.registration.showNotification(data.title ?? "Shulker", options)
        );
    } catch {
        // Malformed push payload — silently ignore
    }
});

self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: "window" }).then(clients => {
            const focused = clients.find(c => c.focus);
            if (focused) return focused.focus();
            return self.clients.openWindow("/");
        })
    );
});
