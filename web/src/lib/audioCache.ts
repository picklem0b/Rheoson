/**
 * Client-side audio cache.
 *
 * The single biggest source of perceived slowness in Rheoson: a track that
 * isn't downloaded locally cannot start until the backend has spawned yt-dlp
 * and produced bytes (seconds, sometimes tens of seconds on Termux). Warming
 * the server helps the first play; this makes every play after it instant.
 *
 * Once a track's bytes have been streamed, they are stored as a Blob here and
 * the player prefers the local copy over the network. That means:
 *   - replaying a track starts immediately, with no backend round trip
 *   - skipping forward/back in the queue is instant for anything already heard
 *   - playback works offline for any track cached this session
 *
 * Storage is a byte-capped LRU in IndexedDB (its own database, so the offline
 * data schema is untouched). Writes are atomic per entry and failures are
 * swallowed — a full or blocked cache must degrade to streaming, never break
 * playback.
 */

import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'rheoson-audio'
const DB_VERSION = 1
const STORE = 'audio'

/** Default ceiling for cached audio bytes (300 MB ≈ 60-80 MP3 tracks). */
const DEFAULT_LIMIT_BYTES = 300 * 1024 * 1024

/**
 * Don't cache anything implausibly large. A stray HTML error page or an
 * endless live stream would otherwise poison the cache.
 */
const MAX_ENTRY_BYTES = 40 * 1024 * 1024
const MIN_ENTRY_BYTES = 1024

interface CachedAudio {
  id: string
  blob: Blob
  size: number
  mime: string
  fetchedAt: number
  /** Bumped on every read so the LRU reflects use, not just fetch time. */
  lastUsed: number
}

let _dbPromise: Promise<IDBPDatabase> | null = null

function _getDb(): Promise<IDBPDatabase> {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' })
          store.createIndex('by-last-used', 'lastUsed')
        }
      },
    }).catch((err) => {
      // Private-mode / quota-blocked environments: disable the cache.
      _dbPromise = null
      throw err
    })
  }
  return _dbPromise
}

export function cacheLimitBytes(): number {
  try {
    const raw = localStorage.getItem('rheoson-audio-cache-limit-mb')
    if (raw !== null) {
      const mb = Number(JSON.parse(raw))
      if (Number.isFinite(mb) && mb >= 0) return mb * 1024 * 1024
    }
  } catch {
    /* fall through to the default */
  }
  return DEFAULT_LIMIT_BYTES
}

// ── Reads ─────────────────────────────────────────────────────

export async function hasAudio(trackId: string): Promise<boolean> {
  if (!trackId) return false
  try {
    const db = await _getDb()
    const key = await db.getKey(STORE, trackId)
    return key !== undefined
  } catch {
    return false
  }
}

/** Cached bytes for a track, or null when it isn't cached. */
export async function getAudio(trackId: string): Promise<Blob | null> {
  if (!trackId) return null
  try {
    const db = await _getDb()
    const entry = (await db.get(STORE, trackId)) as CachedAudio | undefined
    if (!entry?.blob || entry.size <= 0) return null

    // Touch for the LRU (best-effort — never block a read on the write).
    db.put(STORE, { ...entry, lastUsed: Date.now() }).catch(() => {})
    return entry.blob
  } catch {
    return null
  }
}

/**
 * An object URL for a cached track.
 *
 * The caller owns the URL and MUST revoke it when done — the player revokes
 * the previous track's URL on every track change.
 */
/**
 * Map a stored mime type to the file extension hint Howler needs.
 * Howler's html5 mode uses this to decide decode strategy — a wrong or
 * missing hint makes Android WebView fail to start native audio.
 */
function mimeToExt(mime: string | null | undefined): string[] | undefined {
  if (!mime) return undefined
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return ['m4a']
  if (mime.includes('mpeg') || mime.includes('mp3')) return ['mp3']
  if (mime.includes('ogg') || mime.includes('opus')) return ['ogg']
  if (mime.includes('wav')) return ['wav']
  if (mime.includes('flac')) return ['flac']
  return undefined
}

export async function getCachedObjectUrl(trackId: string): Promise<{
  url: string
  mime: string
} | null> {
  const blob = await getAudio(trackId)
  if (!blob) return null
  try {
    return { url: URL.createObjectURL(blob), mime: blob.type || 'audio/mpeg' }
  } catch {
    return null
  }
}

/** Extension hint for a cached track, if one exists. */
export async function getCachedMime(trackId: string): Promise<string | null> {
  const blob = await getAudio(trackId)
  return blob?.type || null
}

export { mimeToExt }

// ── Writes ────────────────────────────────────────────────────

export async function putAudio(
  trackId: string,
  blob: Blob,
  mime = 'audio/mpeg'
): Promise<void> {
  if (!trackId || !blob) return
  if (blob.size < MIN_ENTRY_BYTES || blob.size > MAX_ENTRY_BYTES) return

  try {
    const db = await _getDb()
    const entry: CachedAudio = {
      id: trackId,
      blob,
      size: blob.size,
      mime,
      fetchedAt: Date.now(),
      lastUsed: Date.now(),
    }
    await db.put(STORE, entry)
    // Prune after inserting so the new entry participates in the accounting.
    await pruneAudioCache()
  } catch {
    /* quota / blocked — streaming still works */
  }
}

export async function deleteAudio(trackId: string): Promise<void> {
  try {
    const db = await _getDb()
    await db.delete(STORE, trackId)
  } catch {
    /* ignore */
  }
}

export async function clearAudioCache(): Promise<void> {
  try {
    const db = await _getDb()
    await db.clear(STORE)
  } catch {
    /* ignore */
  }
}

// ── Maintenance ───────────────────────────────────────────────

export async function getAudioCacheStats(): Promise<{
  count: number
  bytes: number
  limitBytes: number
}> {
  const limitBytes = cacheLimitBytes()
  try {
    const db = await _getDb()
    const all = (await db.getAll(STORE)) as CachedAudio[]
    return {
      count: all.length,
      bytes: all.reduce((sum, entry) => sum + (entry.size || 0), 0),
      limitBytes,
    }
  } catch {
    return { count: 0, bytes: 0, limitBytes }
  }
}

/**
 * Evict least-recently-used entries until the cache fits its byte budget.
 * A zero limit means "cache nothing" and clears the store.
 */
export async function pruneAudioCache(): Promise<void> {
  const limit = cacheLimitBytes()

  try {
    const db = await _getDb()
    if (limit <= 0) {
      await db.clear(STORE)
      return
    }

    const all = (await db.getAll(STORE)) as CachedAudio[]
    let total = all.reduce((sum, entry) => sum + (entry.size || 0), 0)
    if (total <= limit) return

    const oldestFirst = [...all].sort(
      (a, b) => (a.lastUsed || a.fetchedAt) - (b.lastUsed || b.fetchedAt)
    )

    const tx = db.transaction(STORE, 'readwrite')
    for (const entry of oldestFirst) {
      if (total <= limit) break
      tx.store.delete(entry.id)
      total -= entry.size || 0
    }
    await tx.done
  } catch {
    /* ignore */
  }
}

// ── Background fill ───────────────────────────────────────────

/** In-flight fills, so the same track is never downloaded twice at once. */
const _inFlight = new Map<string, Promise<boolean>>()

/** Bounded parallelism — a queue of 10 tracks must not open 10 connections. */
const MAX_CONCURRENT_FILLS = 2
let _activeFills = 0
const _fillQueue: Array<() => void> = []

async function _acquireSlot(): Promise<void> {
  if (_activeFills < MAX_CONCURRENT_FILLS) {
    _activeFills += 1
    return
  }
  await new Promise<void>((resolve) => _fillQueue.push(resolve))
  _activeFills += 1
}

function _releaseSlot(): void {
  _activeFills = Math.max(0, _activeFills - 1)
  const next = _fillQueue.shift()
  if (next) next()
}

/**
 * Ensure a track's bytes are in the cache, fetching them if not.
 *
 * Resolves true when the audio is cached (either already was, or the fetch
 * succeeded). Never rejects — callers use this as fire-and-forget warming.
 */
export function ensureAudioCached(
  trackId: string,
  url: string,
  opts: { signal?: AbortSignal } = {}
): Promise<boolean> {
  if (!trackId || !url || cacheLimitBytes() <= 0) return Promise.resolve(false)

  const existing = _inFlight.get(trackId)
  if (existing) return existing

  const task = (async () => {
    try {
      if (await hasAudio(trackId)) return true

      // Only cache complete responses. A 206 (range) means the server is
      // streaming a partial body and storing it would produce a truncated
      // file that plays as silence partway through.
      const res = await fetch(url, { signal: opts.signal })
      if (!res.ok) return false

      const declared = Number(res.headers.get('content-length') ?? '0')
      if (declared > MAX_ENTRY_BYTES) return false

      const blob = await res.blob()
      await putAudio(trackId, blob, res.headers.get('content-type') ?? 'audio/mpeg')
      return true
    } catch {
      return false
    } finally {
      _inFlight.delete(trackId)
    }
  })()

  _inFlight.set(trackId, task)
  return task
}

/**
 * Cache a track in the background, respecting the concurrency budget.
 * Safe to call on intent (hover) — repeats are deduplicated per track.
 */
export async function warmAudioCache(
  trackId: string,
  url: string,
  opts: { signal?: AbortSignal } = {}
): Promise<boolean> {
  if (!trackId || !url || cacheLimitBytes() <= 0) return false
  if (await hasAudio(trackId)) return true

  await _acquireSlot()
  try {
    return await ensureAudioCached(trackId, url, opts)
  } finally {
    _releaseSlot()
  }
}
