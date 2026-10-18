/**
 * Device-local storage under a `Rheoson/` directory.
 *
 * The backend owns the source of truth for account state (likes, history,
 * playlists, follows live in per-user JSON sidecars next to the music), but
 * that whole store disappears behind Render's ephemeral disk, lives on a
 * Termux box that may be off, and is unreachable whenever the phone is
 * offline — which for music, on a train or a plane, is the normal case.
 *
 * So the app keeps a mirror on *this device*:
 *
 *   Rheoson/
 *     cache/           offline state, one JSON file per section per account
 *     crash_reports/   native crash traces (written by the CrashLog plugin)
 *     downloads/       inbound artifacts staged outside the music library
 *     updates/         staged APK/release artifacts for in-place updates
 *
 * Everything here is written through Capacitor Filesystem into the app's
 * private data directory — no storage permission, invisible to other apps,
 * wiped when the app is uninstalled — and degrades to localStorage in the
 * browser build so the same call sites work everywhere.
 *
 * The cache deliberately has no TTL: file-backed storage has no quota panic,
 * and the reader decides what staleness means (see `readOfflineCache` — the
 * `updatedAt` is in the envelope, not enforced here). A last-known liked
 * list from three weeks ago is more useful offline than a spinner.
 *
 * Nothing in this module throws or blocks: it is called during render-critical
 * hydration and inside the snapshot writer, so it is fire-and-forget by
 * construction. It also never overwrites a file with no data — an empty
 * snapshot arriving from a failed revalidation must not erase the only
 * offline copy the device has.
 */

import { isNativePlatform } from './capacitor'

const ROOT = 'Rheoson'
const CACHE_DIR = `${ROOT}/cache`

/** App-private: no storage permission, cleaned up on uninstall. */
const DIR_NAMES = ['crash_reports', 'updates', 'downloads', 'cache'] as const
export type RheosonDirName = (typeof DIR_NAMES)[number]

const CACHE_FORMAT = 'rheoson-cache'
const CACHE_VERSION = 1

/**
 * The sections mirrored to disk. Kept here (rather than in the reader) so the
 * writer and the sign-out wipe cannot disagree about which files exist.
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

// ── Environment ──────────────────────────────────────────────

let _native: boolean | null = null

/** Idempotent: platform never changes mid-session, but avoid import churn. */
function nativeFs(): boolean {
   if (_native === null) _native = isNativePlatform()
   return _native
}

interface FilesystemModule {
   Filesystem: {
      mkdir(opts: { path: string; directory: string; recursive?: boolean }): Promise<unknown>
      writeFile(opts: { path: string; directory: string; data: string }): Promise<unknown>
      readFile(opts: { path: string; directory: string }): Promise<{ data: string }>
      deleteFile(opts: { path: string; directory: string }): Promise<unknown>
   }
   Directory: { Data: string }
}

async function fs(): Promise<FilesystemModule | null> {
   if (!nativeFs()) return null
   try {
      return (await import(/* @vite-ignore */ '@capacitor/filesystem')) as FilesystemModule
   } catch {
      // Plugin not present in this build — fall through to storage.
      return null
   }
}

// ── Directory creation ───────────────────────────────────────

let _dirsCreated: Promise<boolean> | null = null

/**
 * Create the Rheoson/ directory structure. Safe to call from multiple
 * callers at boot (memoized); in the browser build it is a cheap no-op.
 */
export function ensureRheosonDirs(): Promise<boolean> {
   if (!_dirsCreated) {
      _dirsCreated = (async () => {
         const mod = await fs()
         if (!mod) return false
         try {
            for (const name of DIR_NAMES) {
               await mod.Filesystem.mkdir({
                  path: `${ROOT}/${name}`,
                  directory: mod.Directory.Data,
                  recursive: true,
               })
            }
            return true
         } catch {
            // mkdir that already exists, or a locked volume: callers must
            // survive this — rethrows would turn diagnostics into crashes.
            return false
         }
      })()
   }
   return _dirsCreated
}

// ── Per-account namespacing ──────────────────────────────────

/**
 * One flat filename per (account, section).
 *
 * Two accounts on a shared device must never read each other's mirrors, so
 * the file name carries the account rather than the content — a single
 * leaked file leaks at most one account's last-known summary. Hashing keeps
 * a Clerk `user_…` id out of the file name itself.
 */
function fileName(section: string, user: string): string {
   let hash = 0
   for (let i = 0; i < user.length; i++) {
      hash = (hash * 31 + user.charCodeAt(i)) | 0
   }
   const id = Math.abs(hash).toString(36)
   return `${section}-${id || 'local'}.json`
}

// ── Write ────────────────────────────────────────────────────

/**
 * Mirror a section of account state onto this device.
 *
 * Fire-and-forget: called from the snapshot writer's debounce, so it must
 * not reject into an unhandled-rejection crash reporter of all places.
 */
export function writeOfflineCache(
   section: string,
   user: string,
   data: unknown
): void {
   void writeOfflineCacheAsync(section, user, data)
}

async function writeOfflineCacheAsync(
   section: string,
   user: string,
   data: unknown
): Promise<void> {
   // An empty payload must not erase the last-good copy: whichever fetch
   // produced it came back blank (or failed upstream), and blank is not
   // "the user emptied their library".
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
   const body = JSON.stringify(envelope)
   const mod = await fs()
   const name = fileName(section, user)

   if (mod) {
      await ensureRheosonDirs()
      try {
         await mod.Filesystem.writeFile({
            path: `${CACHE_DIR}/${name}`,
            directory: mod.Directory.Data,
            data: body,
         })
         return
      } catch {
         // Fall through to storage — a full disk is no reason to lose the
         // mirror entirely.
      }
   }
   try {
      window.localStorage.setItem(`rheoson:offline:${section}:${user}`, body)
   } catch {
      // Quota/private mode: the localStorage snapshot layer keeps small
      // summaries alive; this mirror is the casualty, not the app.
   }
}

// ── Read ─────────────────────────────────────────────────────

/**
 * Read a section back, with the write time so the caller can decide
 * staleness. Returns null when there is nothing (or an envelope this build
 * cannot parse — a corrupt mirror is treated as absent, never as an error).
 */
export async function readOfflineCache<T = unknown>(
   section: string,
   user: string
): Promise<CacheEnvelope & { data: T } | null> {
   const name = fileName(section, user)
   const mod = await fs()
   let raw: string | null = null

   if (mod) {
      try {
         const res = await mod.Filesystem.readFile({
            path: `${CACHE_DIR}/${name}`,
            directory: mod.Directory.Data,
         })
         raw = res.data
      } catch {
         // Not written yet, native FS unavailable, or unreadable → storage.
      }
   }
   if (raw == null) {
      try {
         raw = window.localStorage.getItem(`rheoson:offline:${section}:${user}`)
      } catch {
         raw = null
      }
   }
   if (!raw) return null

   try {
      const parsed = JSON.parse(raw) as CacheEnvelope
      if (parsed?.format !== CACHE_FORMAT) return null
      if (typeof parsed.updatedAt !== 'string') return null
      // `stamp` of unknown shape is ignored rather than trusted into queries.
      return parsed as CacheEnvelope & { data: T }
   } catch {
      return null
   }
}

// ── Wipe ─────────────────────────────────────────────────────

/**
 * Remove one account's mirror files. Mirror of `clearSnapshots()`: on
 * sign-out a shared device must not keep an account's state behind for the
 * next person.
 */
export async function clearOfflineCache(user: string): Promise<void> {
   const mod = await fs()
   if (mod) {
      for (const section of CACHE_SECTIONS) {
         try {
            await mod.Filesystem.deleteFile({
               path: `${CACHE_DIR}/${fileName(section, user)}`,
               directory: mod.Directory.Data,
            })
         } catch {
            // Absent file: already the desired state.
         }
      }
   }
   try {
      for (const section of CACHE_SECTIONS) {
         window.localStorage.removeItem(`rheoson:offline:${section}:${user}`)
      }
   } catch {
      // Unavailable storage is already clear, as far as this layer cares.
   }
}
