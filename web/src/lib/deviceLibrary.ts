/**
 * Keeping a Spotify import on the device, as well as on the server.
 *
 * The server download writes files into the music folder — on Termux that is
 * already the phone, on a hosted deployment it is not. Either way the *player*
 * has a second, independent copy available: `audioCache` stores the streamed
 * bytes in IndexedDB and `_resolveUrl` prefers them, so warming every track of
 * a playlist is what makes it play with no connection.
 *
 * That is exactly what this module does, one track at a time, respecting the
 * cache's own concurrency budget and its byte ceiling. It is honest about the
 * ceiling: a playlist bigger than the budget evicts its own oldest tracks
 * (the cache is an LRU), so the progress it reports is "cached now", not
 * "permanent".
 */

import { API_BASE } from './constants'
import { hasAudio, warmAudioCache } from './audioCache'

export interface DeviceSaveProgress {
   done: number
   total: number
   saved: number
   failed: number
}

export interface DeviceSaveOptions {
   onProgress?: (progress: DeviceSaveProgress) => void
   signal?: AbortSignal
}

/** The same URL the player fills the cache from. */
export function streamUrlFor(trackId: string): string {
   return `${API_BASE}/stream/${encodeURIComponent(trackId)}/audio`
}

/**
 * Cache these tracks for offline playback, reporting progress as it goes.
 *
 * Never throws for a single track: a dead stream is a failed count, not the
 * end of the run — one unavailable song must not abandon the other ninety.
 */
export async function keepTracksOnDevice(
   trackIds: string[],
   { onProgress, signal }: DeviceSaveOptions = {}
): Promise<DeviceSaveProgress> {
   const unique = [...new Set(trackIds.filter(Boolean))]
   const progress: DeviceSaveProgress = { done: 0, total: unique.length, saved: 0, failed: 0 }

   for (const trackId of unique) {
      if (signal?.aborted) break
      let ok = false
      try {
         ok = (await hasAudio(trackId)) || (await warmAudioCache(trackId, streamUrlFor(trackId), { signal }))
      } catch {
         ok = false
      }
      progress.done += 1
      if (ok) progress.saved += 1
      else progress.failed += 1
      onProgress?.({ ...progress })
   }

   return progress
}
