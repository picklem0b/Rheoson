/**
 * Network detection — online/offline status with event-based updates.
 *
 * Works in both Capacitor (native) and browser environments.
 * The Capacitor Network plugin provides more reliable status on Android,
 * while the browser uses navigator.onLine + online/offline events.
 *
 * Usage:
 *   import { isOnline, onStatusChange } from '@/lib/network'
 *
 *   if (isOnline()) { ... }
 *   const unsub = onStatusChange((online) => { ... })
 */

// ── State ──────────────────────────────────────────────────────

let _online = typeof navigator !== 'undefined' ? navigator.onLine : true;
const _listeners: Set<(online: boolean) => void> = new Set();
let _capacitorAvailable = false;

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
            _listeners.forEach((l) => l(_online));
            window.dispatchEvent(
               new CustomEvent('rheoson:network-change', { detail: { online: _online } })
            );
         }
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
      _listeners.forEach((l) => l(true));
      window.dispatchEvent(
         new CustomEvent('rheoson:network-change', { detail: { online: true } })
      );
   });

   window.addEventListener('offline', () => {
      _online = false;
      _listeners.forEach((l) => l(false));
      window.dispatchEvent(
         new CustomEvent('rheoson:network-change', { detail: { online: false } })
      );
   });
}

// ── Health check ───────────────────────────────────────────────
// Periodically ping the backend to verify actual connectivity.
// navigator.onLine can be unreliable (e.g. on Android with no captive portal).

let _healthTimer: ReturnType<typeof setInterval> | null = null;

function _startHealthCheck(getHealthUrl: () => string) {
   if (_healthTimer) return;
   _healthTimer = setInterval(async () => {
      try {
         const res = await fetch(getHealthUrl(), {
            method: 'HEAD',
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
         });
         const wasOnline = _online;
         _online = res.ok;
         if (wasOnline !== _online) {
            _listeners.forEach((l) => l(_online));
            window.dispatchEvent(
               new CustomEvent('rheoson:network-change', { detail: { online: _online } })
            );
         }
      } catch {
         if (_online) {
            _online = false;
            _listeners.forEach((l) => l(false));
            window.dispatchEvent(
               new CustomEvent('rheoson:network-change', { detail: { online: false } })
            );
         }
      }
   }, 30_000); // every 30 seconds
}

// ── Init (call once at app startup) ────────────────────────────

let _initialized = false;

export function initNetwork(getHealthUrl: () => string) {
   if (_initialized) return;
   _initialized = true;
   _initCapacitor().then(() => _initBrowser());
   _startHealthCheck(getHealthUrl);
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
