/**
 * Browser-side offline cache — one JSON envelope per (account, section).
 *
 * The backend owns the source of truth for account state (likes, history,
 * playlists and follows live in per-user JSON sidecars next to the music),
 * but that store disappears behind Render's ephemeral disk and is unreachable
 * whenever the machine running the API is offline. The browser keeps its own
 * mirror in `localStorage` so the last known state is there when the network
 * is not.
 *
 * The phone app (apps/mobile) writes the identical envelope into its own
 * `Rheoson/cache/` directory, so a cache dump from either client is readable
 * by the other.
 *
 * The cache deliberately has no TTL: the reader decides what staleness means
 * (`updatedAt` travels in the envelope, it is not enforced here). A liked list
 * from three weeks ago is more useful offline than a spinner.
 *
 * Nothing here throws: it runs inside the snapshot writer and during
 * hydration, and a mirror that cannot be read is treated as absent — never as
 * an error the app has to handle.
 */

const CACHE_FORMAT = 'rheoson-cache'
const CACHE_VERSION = 1

/**
 * The sections that get mirrored. Kept together with the reader so the writer
 * and the sign-out wipe cannot disagree about which entries exist.
 */
export const CACHE_SECTIONS = ['liked', 'history', 'playlists', 'following'] as const
export type CacheSection = (typeof CACHE_SECTIONS)[number]

export interface CacheEnvelope {
   format: typeof CACHE_FORMAT
   version: number
   section: string
   user: string
   updatedAt: string
   data: unknown
}

/** Account ids are Clerk `user_…` strings; hashing keeps them out of the key. */
function cacheKey(section: string, user: string): string {
   let hash = 0
   for (let i = 0; i < user.length; i++) {
      hash = (hash * 31 + user.charCodeAt(i)) | 0
   }
   const id = Math.abs(hash).toString(36)
   return `rheoson:offline:${section}:${id || 'local'}`
}

/**
 * Mirror a section of account state.
 *
 * Synchronous by design: the caller is the snapshot writer's debounce, and a
 * rejected promise there would surface as an unhandled rejection in the very
 * crash reporter that is meant to explain real failures.
 */
export function writeOfflineCache(section: string, user: string, data: unknown): void {
   // Blank data must not erase the last-good copy: whichever fetch produced it
   // came back empty (or failed upstream), and empty is not "the account
   // cleared its library".
   const blank = data == null || (Array.isArray(data) && data.length === 0)
   if (blank) return

   const envelope: CacheEnvelope = {
      format: CACHE_FORMAT,
      version: CACHE_VERSION,
      section,
      user,
      updatedAt: new Date().toISOString(),
      data,
   }

   try {
      window.localStorage.setItem(cacheKey(section, user), JSON.stringify(envelope))
   } catch {
      // Quota or private mode: the small snapshot layer keeps summaries alive,
      // this mirror is the casualty, not the app.
   }
}

/**
 * Read a section back, with the write time so the caller can decide staleness.
 *
 * Returns null when there is nothing, or when the stored envelope is not one
 * this build understands — a corrupt mirror is absent, never an error.
 */
export function readOfflineCache<T = unknown>(
   section: string,
   user: string
): (CacheEnvelope & { data: T }) | null {
   let raw: string | null = null
   try {
      raw = window.localStorage.getItem(cacheKey(section, user))
   } catch {
      return null
   }
   if (!raw) return null

   try {
      const parsed = JSON.parse(raw) as CacheEnvelope
      if (parsed?.format !== CACHE_FORMAT) return null
      if (typeof parsed.updatedAt !== 'string') return null
      return parsed as CacheEnvelope & { data: T }
   } catch {
      return null
   }
}

/**
 * Remove one account's mirror entries.
 *
 * Called on sign-out: a shared browser must not keep an account's state behind
 * for the next person, the same reason `clearSnapshots()` exists.
 */
export function clearOfflineCache(user: string): void {
   try {
      for (const section of CACHE_SECTIONS) {
         window.localStorage.removeItem(cacheKey(section, user))
      }
   } catch {
      // Unavailable storage is already clear, as far as this layer cares.
   }
}
