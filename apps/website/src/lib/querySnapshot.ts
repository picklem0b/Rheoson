/**
 * A small localStorage snapshot of the queries worth painting instantly.
 *
 * Without it, every revisit starts from an empty cache: the profile shows a
 * spinner for a like count that has not changed in weeks, and the answer only
 * appears after a round trip. The snapshot keeps those small, settled answers
 * on the device so they render immediately, and React Query still refetches in
 * the background, so what is shown is never the only source of truth.
 *
 * Scope is deliberately narrow:
 *
 * * Only keys in `SNAPSHOT_KEYS` are stored — small account summaries, never
 *   library listings or search results.
 * * Storage is namespaced per account and wiped on sign-out, so a shared device
 *   cannot show one account's counts to the next person.
 * * Stale entries are ignored rather than shown, and the whole thing degrades to
 *   a no-op when storage is unavailable (private browsing, disabled cookies).
 */

import type { QueryClient } from '@tanstack/react-query'
import { qk, isSnapshotKey } from './queryKeys'
import { writeOfflineCache, readOfflineCache, type CacheEnvelope } from './localState'

const PREFIX = 'rheoson:qs:'
/** Beyond this, a remembered answer is not worth showing unverified. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Hard cap on the size of one account's snapshot. */
const MAX_BYTES = 256 * 1024
const WRITE_DEBOUNCE_MS = 400

type Entry = { data: unknown; at: number }
type Snapshot = Record<string, Entry>

/**
 * Which React Query key is mirrored to which offline-cache section. Broader
 * than the snapshot whitelist above: these are full listings (the liked list
 * itself, the full history) that the byte-capped snapshot cannot hold, and
 * they are what makes the app usable offline.
 */
const OFFLINE_SECTIONS: Array<[readonly unknown[], string]> = [
   [qk.likedTracks(), 'liked'],
   [qk.recentlyPlayedFull(), 'history'],
   [qk.playlists(), 'playlists'],
   [qk.following(), 'following'],
]

function offlineSectionOf(key: readonly unknown[]): string | undefined {
   for (const [prefix, section] of OFFLINE_SECTIONS) {
      if (prefix.length <= key.length && prefix.every((part, i) => part === key[i])) {
         return section
      }
   }
   return undefined
}

function storageKey(account: string): string {
  // Accounts are Clerk ids (`user_...`); the fallback covers the keyless
  // development shell, which has no account but still benefits.
  return `${PREFIX}${account || 'local'}`
}

function readRaw(account: string): Snapshot {
  try {
    const raw = window.localStorage.getItem(storageKey(account))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Snapshot
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeRaw(account: string, snapshot: Snapshot): void {
  try {
    // An empty snapshot is not worth a write, and removing the key is what
    // makes "cleared to zero" actually stick on the next visit.
    if (Object.keys(snapshot).length === 0) {
      window.localStorage.removeItem(storageKey(account))
      return
    }
    const payload = JSON.stringify(snapshot)
    if (payload.length > MAX_BYTES) return
    window.localStorage.setItem(storageKey(account), payload)
  } catch {
    // Storage full or unavailable — instant paint is a nicety, not a feature.
  }
}

/**
 * Seed the cache from the account's snapshot.
 *
 * Entries are stamped with their original `updatedAt`, so React Query treats
 * them as already-stale and revalidates in the background instead of trusting
 * them for the `staleTime` window.
 */
export function hydrateSnapshot(client: QueryClient, account: string): number {
  const snapshot = readRaw(account)
  const now = Date.now()
  let restored = 0

  for (const [serialised, entry] of Object.entries(snapshot)) {
    if (!entry || now - entry.at > MAX_AGE_MS) continue
    try {
      const key = JSON.parse(serialised) as unknown[]
      if (!isSnapshotKey(key)) continue
      client.setQueryData(key, entry.data, { updatedAt: entry.at })
      restored += 1
    } catch {
      // A malformed key simply isn't restored.
    }
  }
  return restored
}

/**
 * Restore the full-listing offline mirror, but only into queries that
 * currently have nothing at all.
 *
 * The data is stamped with its write time, so React Query sees it as already
 * stale and revalidates in the background — online that replaces it within one
 * round trip, offline it simply stays as the last known state, which is the
 * entire point. Returns how many sections were seeded.
 */
export function hydrateOffline(client: QueryClient, account: string): number {
   const now = Date.now()
   let seeded = 0

   for (const [prefix, section] of OFFLINE_SECTIONS) {
      const envelope: CacheEnvelope | null = readOfflineCache(section, account)
      if (!envelope || envelope.data == null) continue
      try {
         const key = prefix as readonly unknown[]
         const existing = client.getQueryData(key as unknown[])
         // A query that already answered (from the network or the 24h
         // snapshot) outranks the mirror; only genuinely-empty queries get
         // seeded, otherwise the mirror would fight fetch results.
         if (existing !== undefined) continue
         const at = Date.parse(envelope.updatedAt)
         client.setQueryData(key as unknown[], envelope.data, {
            updatedAt: Number.isFinite(at) ? at : now,
         })
         seeded += 1
      } catch {
         // Malformed envelope is skipped, as decided in readOfflineCache.
      }
   }
   return seeded
}



function collect(client: QueryClient): Snapshot {
  const snapshot: Snapshot = {}
  for (const query of client.getQueryCache().getAll()) {
    if (query.state.status !== 'success') continue
    if (!isSnapshotKey(query.queryKey)) continue
    if (query.state.data === undefined) continue
    snapshot[JSON.stringify(query.queryKey)] = {
      data: query.state.data,
      at: query.state.dataUpdatedAt || Date.now(),
    }
  }
  return snapshot
}

/**
 * Which settled queries make it into the file-backed mirror. Separate from
 * `collect` on purpose: the mirror has no quota, so it carries the full
 * listings the byte-capped localStorage snapshot cannot.
 */
function collectOffline(client: QueryClient): ReadonlyMap<string, unknown> {
   const mirror = new Map<string, unknown>()
   for (const query of client.getQueryCache().getAll()) {
      if (query.state.status !== 'success') continue
      if (query.state.data === undefined) continue
      const section = offlineSectionOf(query.queryKey)
      if (!section) continue
      mirror.set(section, query.state.data)
   }
   return mirror
}

/**
 * Keep the account's snapshot in step with the cache.
 *
 * Returns a disposer. Writes are debounced because a single page load settles
 * several queries in a burst, and every one of them would otherwise rewrite the
 * same JSON blob.
 */
export function startSnapshotWriter(client: QueryClient, account: string): () => void {
   let timer: number | undefined

   const unsubscribe = client.getQueryCache().subscribe(() => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
         timer = undefined
         writeRaw(account, collect(client))
         // The full-listing mirror is written from the same debounce — one
         // settled network burst rewrites both layers once, not per query.
         for (const [section, data] of collectOffline(client)) {
            writeOfflineCache(section, account, data)
         }
      }, WRITE_DEBOUNCE_MS)
   })

  return () => {
    if (timer !== undefined) window.clearTimeout(timer)
    unsubscribe()
  }
}

/**
 * Point the snapshot layer at `account`: restore what it remembers, then track
 * it. Returns a disposer for the writer.
 */
export function activateSnapshot(client: QueryClient, account: string): () => void {
  hydrateSnapshot(client, account)
  // The full-listing mirror fills in whatever the small snapshot could not
  // hold (the liked list, the history). It only seeds queries that have no
  // answer at all, so it never races a real response.
  hydrateOffline(client, account)
  return startSnapshotWriter(client, account)
}

/**
 * Remove every account's snapshot.
 *
 * Called on sign-out: leaving a previous account's counts on a shared device
 * would show the next person numbers that are not theirs.
 */
export function clearSnapshots(): void {
  try {
    const stale: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(PREFIX)) stale.push(key)
    }
    for (const key of stale) window.localStorage.removeItem(key)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
