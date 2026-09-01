/**
 * Offline queue — replays pending mutations when the backend comes online.
 *
 * When a POST/PUT/PATCH/DELETE is attempted while offline, it gets queued
 * in IndexedDB. When the device reconnects, the queue is replayed in order.
 *
 * This means: create a playlist offline → it queues → replay creates it
 * on the server when you reconnect.
 */

import { syncQueueStore, type SyncQueueItem } from './localDb';
import { isOnline, onStatusChange } from './network';
import { API_BASE } from './constants';

// ── State ──────────────────────────────────────────────────────

let _syncing = false;
let _listeners: Set<() => void> = new Set();

// ── Queue a mutation ───────────────────────────────────────────

interface QueuedRequest {
   method: string;
   endpoint: string;
   body?: unknown;
}

/**
 * Add a mutation to the offline queue.
 * Returns the queue item ID for tracking.
 */
export async function queueMutation(req: QueuedRequest): Promise<string> {
   await syncQueueStore.add({
      type: _inferType(req.method, req.endpoint),
      payload: (req.body as Record<string, unknown>) ?? {},
      endpoint: req.endpoint,
      method: req.method.toUpperCase(),
   });

   _notifyListeners();

   // Try to sync immediately if online
   if (isOnline()) {
      // Fire and forget — don't block the caller
      syncQueue().catch(() => {});
   }

   return `queued-${Date.now()}`;
}

// ── Replay queue ───────────────────────────────────────────────

/**
 * Replay all pending mutations in FIFO order.
 * Failed items are kept for retry.
 */
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
   if (_syncing) return { synced: 0, failed: 0 };
   _syncing = true;

   let synced = 0;
   let failed = 0;

   try {
      const items = await syncQueueStore.getAll();

      for (const item of items) {
         try {
            const headers: Record<string, string> = {
               'Content-Type': 'application/json',
            };

            // Inject auth token
            const token = _getAuthToken();
            if (token) {
               headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch(`${API_BASE}${item.endpoint}`, {
               method: item.method,
               headers,
               body: Object.keys(item.payload).length > 0 ? JSON.stringify(item.payload) : undefined,
            });

            if (res.ok) {
               await syncQueueStore.remove(item.id);
               synced++;
            } else if (res.status >= 400 && res.status < 500) {
               // Client error — don't retry (bad request, auth failure, etc.)
               console.warn(`[OfflineQueue] Dropping ${item.method} ${item.endpoint} — HTTP ${res.status}`);
               await syncQueueStore.remove(item.id);
               failed++;
            }
            // Server error (5xx) — keep in queue for retry
         } catch {
            // Network error — stop processing, keep remaining items
            break;
         }
      }
   } finally {
      _syncing = false;
      if (synced > 0 || failed > 0) {
         _notifyListeners();
      }
   }

   return { synced, failed };
}

// ── Auto-sync on reconnect ─────────────────────────────────────

let _autoSyncInitialized = false;

export function initAutoSync() {
   if (_autoSyncInitialized) return;
   _autoSyncInitialized = true;

   onStatusChange(async (online) => {
      if (online) {
         // Small delay to let connection stabilize
         await new Promise((r) => setTimeout(r, 1000));
         syncQueue().catch(() => {});
      }
   });
}

// ── Queue status ───────────────────────────────────────────────

export async function getQueueSize(): Promise<number> {
   return syncQueueStore.count();
}

export async function clearQueue(): Promise<void> {
   await syncQueueStore.clear();
   _notifyListeners();
}

// ── Listener pattern ───────────────────────────────────────────

export function onQueueChange(callback: () => void): () => void {
   _listeners.add(callback);
   return () => _listeners.delete(callback);
}

function _notifyListeners() {
   _listeners.forEach((l) => l());
}

// ── Helpers ────────────────────────────────────────────────────

function _getAuthToken(): string | null {
   try {
      const raw = localStorage.getItem('rheoson-auth');
      if (raw) {
         const parsed = JSON.parse(raw);
         return parsed?.state?.token ?? null;
      }
   } catch {
      /* ignore */
   }
   return null;
}

function _inferType(
   method: string,
   endpoint: string
): SyncQueueItem['type'] {
   const m = method.toUpperCase();
   if (m === 'POST' && endpoint.includes('/like')) return 'like';
   if (m === 'DELETE' && endpoint.includes('/like')) return 'unlike';
   if (m === 'POST' && endpoint.includes('/play')) return 'record-play';
   if (m === 'POST' && endpoint.includes('/playlists') && !endpoint.includes('/tracks')) return 'create-playlist';
   if (m === 'DELETE' && endpoint.includes('/playlists')) return 'delete-playlist';
   if (m === 'POST' && endpoint.includes('/tracks')) return 'add-track';
   if (m === 'DELETE' && endpoint.includes('/tracks')) return 'remove-track';
   if (m === 'PATCH' && endpoint.includes('/playlists')) return 'update-playlist';
   return 'record-play'; // fallback
}
