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
import { isSnapshotKey } from './queryKeys'

const PREFIX = 'rheoson:qs:'
/** Beyond this, a remembered answer is not worth showing unverified. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Hard cap on the size of one account's snapshot. */
const MAX_BYTES = 256 * 1024
const WRITE_DEBOUNCE_MS = 400

type Entry = { data: unknown; at: number }
type Snapshot = Record<string, Entry>

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
