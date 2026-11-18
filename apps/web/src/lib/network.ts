/**
 * Network detection — online/offline status with event-based updates.
 *
 * Works in both Capacitor (native) and browser environments.
 * The Capacitor Network plugin provides more reliable status on Android,
 * while the browser uses navigator.onLine + online/offline events.
 *
 * Health polling policy (single source of truth — every other poller in the
 * app was removed; subscribe with onStatusChange or use checkNow() instead):
 *
 *   - healthy:  probe every 14 minutes (cheap HEAD, tiny battery cost)
 *   - failing:  recovery probes back off 15s → 30s → 1m → 2m → 4m → 8m
 *               so the app heals itself within seconds of the backend
 *               coming back, without hammering a sleeping server
 *   - hidden:   tab in background skips probes; visible + status change
 *               probes immediately
 *   - on recovery: the Socket.IO singleton is revived so download
 *               progress events resume without a page refresh
 *
 * Usage:
 *   import { isOnline, onStatusChange, checkNow } from '@/lib/network'
 *
 *   if (isOnline()) { ... }
 *   const unsub = onStatusChange((online) => { ... })
 */

import { ws } from '@/lib/websocket.lib';

// ── State ──────────────────────────────────────────────────────

let _online = typeof navigator !== 'undefined' ? navigator.onLine : true;
const _listeners: Set<(online: boolean) => void> = new Set();
let _capacitorAvailable = false;

// ── Timing constants ───────────────────────────────────────────

/** Healthy cadence — the backend gets pinged every 14 minutes, nothing more. */
const HEALTHY_INTERVAL_MS = 14 * 60 * 1000;
/** First recovery probe comes fast, then backs off (values in ms). */
const RECOVERY_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 240_000, 480_000] as const;
const PROBE_TIMEOUT_MS = 5_000;

// ── Probe machinery ────────────────────────────────────────────

let _timer: ReturnType<typeof setTimeout> | null = null;
let _probing = false;
let _failStreak = 0;
let _getHealthUrl: (() => string) | null = null;
let _documentListenerBound = false;

function _clearTimer() {
   if (_timer !== null) {
      clearTimeout(_timer);
      _timer = null;
   }
}

function _scheduleNext(delayMs: number) {
   _clearTimer();
   _timer = setTimeout(() => {
      _timer = null;
      void _probe();
   }, delayMs);
}

async function _probe() {
   if (_probing || !_getHealthUrl) return;
   if (typeof document !== 'undefined' && document.hidden) {
      // Background tab — skip the probe; visibilitychange will re-probe.
      return;
   }

   _probing = true;
   let ok = false;
   try {
      // GET with a 1-byte range, not HEAD: FastAPI GET routes answer HEAD
      // with 405, and CapacitorHttp on Android mangles HEAD semantics —
      // the probe always "failed" while real (GET) traffic worked fine,
      // which lied to the user with an offline banner and disabled every
      // prefetch/cache path in the app. Any status below 500 proves the
      // API is alive; the range header keeps the body to a single byte.
      const res = await fetch(_getHealthUrl(), {
         method: 'GET',
         cache: 'no-store',
         headers: { Range: 'bytes=0-0' },
         signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      ok = res.status < 500;
   } catch {
      ok = false;
   } finally {
      _probing = false;
   }

   const wasOnline = _online;
   _online = ok;

   if (ok) {
      _failStreak = 0;
      _scheduleNext(HEALTHY_INTERVAL_MS);
   } else {
      const backoff = RECOVERY_BACKOFF_MS[Math.min(_failStreak, RECOVERY_BACKOFF_MS.length - 1)];
      _failStreak += 1;
      _scheduleNext(backoff);
   }

   if (wasOnline !== _online) {
      _notify(_online);
   }
}

function _notify(online: boolean) {
   _listeners.forEach((l) => l(online));
   window.dispatchEvent(
      new CustomEvent('rheoson:network-change', { detail: { online } })
   );

   if (online) {
      // The socket gives up after 10 reconnect attempts — revive it so
      // download progress / live events resume without a page refresh.
      try {
         ws.connect();
      } catch {
         // Socket layer not initialized yet — nothing to revive.
      }
   }
}

// ── Capacitor detection ────────────────────────────────────────

async function _initCapacitor() {
   try {
      const { Network } = await import(/* @vite-ignore */ '@capacitor/network');
      const status = await Network.getStatus();
      _online = status.connected;

      Network.addListener('networkStatusChange', (status: { connected: boolean }) => {
         const wasOnline = _online;
         _online = status.connected;
         if (wasOnline !== _online) {
            _notify(_online);
         }
         // Connectivity changed — verify the backend right away rather
         // than waiting out the current timer.
         if (_getHealthUrl) void _probe();
      });

      _capacitorAvailable = true;
   } catch {
      // Not in Capacitor or plugin not available — fall back to browser events
   }
}

// ── Browser fallback ───────────────────────────────────────────

function _initBrowser() {
   if (_capacitorAvailable) return;

   window.addEventListener('online', () => {
      _online = true;
      _notify(true);
      void _probe();
   });

   window.addEventListener('offline', () => {
      _online = false;
      _notify(false);
   });
}

/** Re-probe promptly when the tab becomes visible again. */
function _initVisibility() {
   if (_documentListenerBound || typeof document === 'undefined') return;
   _documentListenerBound = true;
   document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void _probe();
   });
}

// ── Init (call once at app startup) ────────────────────────────

let _initialized = false;

export function initNetwork(getHealthUrl: () => string) {
   if (_initialized) return;
   _initialized = true;
   _getHealthUrl = getHealthUrl;
   _initCapacitor().then(() => {
      _initBrowser();
      _initVisibility();
   });
   void _probe();
}

// ── Public API ─────────────────────────────────────────────────

/** Current online status. */
export function isOnline(): boolean {
   return _online;
}

/**
 * Subscribe to online/offline changes.
 * Returns an unsubscribe function.
 */
export function onStatusChange(callback: (online: boolean) => void): () => void {
   _listeners.add(callback);
   return () => _listeners.delete(callback);
}

/**
 * Force an immediate health probe (Retry buttons, foregrounded screens).
 * Safe to call concurrently — re-entrant calls are folded into the
 * in-flight probe.
 */
export function checkNow(): void {
   void _probe();
}

/**
 * Wait for the next time the device comes online.
 * Resolves immediately if already online.
 */
export function waitForOnline(timeoutMs = 60_000): Promise<void> {
   if (_online) return Promise.resolve();

   return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
         unsub();
         reject(new Error('Timed out waiting for network'));
      }, timeoutMs);

      const unsub = onStatusChange((online) => {
         if (online) {
            clearTimeout(timer);
            unsub();
            resolve();
         }
      });
   });
}
