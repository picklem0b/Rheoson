'use client';

/**
 * The audio byte cache — IndexedDB, not localStorage.
 *
 * Two reasons, both structural:
 *
 * * localStorage is synchronous and string-only; a 4 MB track as base64 would
 *   block the main thread *and* triple in size.
 * * The cache is per-device and disposable. Nothing here is worth syncing, and
 *   a wipe must cost a re-download, not a broken library.
 *
 * The promise this file makes to the player: `get()` either returns the bytes
 * or returns null, and it never throws. A cache failure must never be the
 * reason a track does not play.
 */

const DB_NAME = 'rheoson-cache';
const DB_VERSION = 1;
const STORE = 'audio';

/** Never cache a whole track: a phone's quota is not a privilege to spend. */
const MAX_BYTES = 12 * 1024 * 1024;
/** Above this, an entry is evicted oldest-first on write. */
const QUOTA_BYTES = 400 * 1024 * 1024;

interface CachedEntry {
  key: string;
  bytes: ArrayBuffer;
  contentType: string;
  storedAt: number;
  size: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      // Private browsing modes refuse IndexedDB outright. That is a degraded
      // cache, not a broken app.
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const transaction = db.transaction(STORE, mode);
          const request = run(transaction.objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function get(trackId: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const entry = await tx<CachedEntry>('readonly', (store) => store.get(trackId) as IDBRequest<CachedEntry>);
  if (!entry || !entry.bytes) return null;
  return { bytes: entry.bytes, contentType: entry.contentType || 'audio/mpeg' };
}

export async function put(trackId: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return;
  await tx('readwrite', (store) =>
    store.put({
      key: trackId,
      bytes,
      contentType,
      storedAt: Date.now(),
      size: bytes.byteLength,
    } satisfies CachedEntry) as IDBRequest<IDBValidKey>,
  );
  await enforceQuota();
}

export async function evict(trackId: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(trackId) as IDBRequest<undefined>);
}

export async function clear(): Promise<void> {
  await tx('readwrite', (store) => store.clear() as IDBRequest<undefined>);
}

/** Bytes currently held — shown in settings, since it is real disk usage. */
export async function usage(): Promise<{ entries: number; bytes: number }> {
  const all = await tx<CachedEntry[]>('readonly', (store) => store.getAll() as IDBRequest<CachedEntry[]>);
  const list = all ?? [];
  return { entries: list.length, bytes: list.reduce((total, entry) => total + (entry.size ?? 0), 0) };
}

/**
 * Evict oldest-first once the quota is passed.
 *
 * Oldest-first rather than least-recently-used on purpose: reading the access
 * time of every entry on every write costs a full scan of a store that is
 * growing precisely when the scan is most expensive.
 */
async function enforceQuota(): Promise<void> {
  const all = await tx<CachedEntry[]>('readonly', (store) => store.getAll() as IDBRequest<CachedEntry[]>);
  const list = (all ?? []).sort((a, b) => a.storedAt - b.storedAt);

  let total = list.reduce((sum, entry) => sum + (entry.size ?? 0), 0);
  for (const entry of list) {
    if (total <= QUOTA_BYTES) break;
    await evict(entry.key);
    total -= entry.size ?? 0;
  }
}

/** Fetch a track's bytes and cache them, honouring a byte range when given. */
export async function fetchAndCache(
  url: string,
  trackId: string,
  init: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<Response> {
  const response = await fetch(url, { headers: init.headers, signal: init.signal });
  if (!response.ok) return response;

  // A partial response is usable but not cacheable: caching it would make the
  // next full-range play serve a fragment.
  const isPartial = response.status === 206;
  if (isPartial || !response.body) return response;

  const contentType = response.headers.get('content-type') ?? 'audio/mpeg';
  const buffer = await response.clone().arrayBuffer();
  void put(trackId, buffer, contentType);
  return response;
}
