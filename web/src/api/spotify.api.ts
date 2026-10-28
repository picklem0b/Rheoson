/**
 * Spotify links: preview what they hold, then turn them into library songs.
 *
 * Spotify audio is DRM-protected, so nothing downloads the Spotify stream
 * itself. The backend reads the collection's metadata and matches each song on
 * YouTube Music; this module is the client half of that — a preview the user
 * can inspect before anything is queued, and a pollable import because a real
 * playlist takes minutes to match.
 */

import type { Track } from '@/types'
import { normalizeTracks } from '@/lib/normalize'
import { api } from './client.api'

export interface UnmatchedTrack {
   title: string
   artist: string
   spotifyId?: string
   reason: string
   score?: number
}

export interface CollectionPreview {
   type: string
   title: string
   artworkUrl: string
   /** Every song the link names that can be played — matched or not. */
   total: number
   matched: number
   /** Items that can never play: local files, podcasts, removed tracks. */
   skipped: number
   tracks: Track[]
   unmatched: UnmatchedTrack[]
}

export interface SpotifyImportState {
   id: string
   status: 'resolving' | 'queueing' | 'done' | 'error'
   url: string
   kind: string
   title: string
   artworkUrl: string
   total: number
   matched: number
   queued: number
   skipped: number
   skippedExisting: number
   unmatched: UnmatchedTrack[]
   error?: string | null
   createdAt: string
   finishedAt?: string | null
}

type RawPreview = {
   type?: string
   query?: string
   tracks?: unknown[]
   playlists?: { title?: string; artworkUrl?: string }[]
   albums?: { title?: string; artworkUrl?: string }[]
   artists?: { name?: string; imageUrl?: string }[]
   total?: number
   matched?: number
   skipped?: number
   unmatched?: UnmatchedTrack[]
}

function normalizePreview(raw: RawPreview): CollectionPreview {
   const tracks = normalizeTracks(raw.tracks ?? [])
   const first =
      raw.playlists?.[0] ??
      raw.albums?.[0] ??
      (raw.artists?.[0] ? { title: raw.artists[0].name, artworkUrl: raw.artists[0].imageUrl } : undefined)

   return {
      type: raw.type ?? '',
      title: first?.title ?? (tracks[0]?.title ?? 'That link'),
      artworkUrl: first?.artworkUrl || (tracks[0]?.artworkUrl ?? ''),
      total: raw.total ?? tracks.length,
      matched: raw.matched ?? tracks.length,
      skipped: raw.skipped ?? 0,
      tracks,
      unmatched: raw.unmatched ?? []
   }
}

const NO_REDIRECT = { _noFatalRedirect: true } as const

export const spotifyApi = {
   /** Read a Spotify link without queueing anything. */
   preview: async (url: string, signal?: AbortSignal): Promise<CollectionPreview> => {
      const raw = await api.post<RawPreview>('/search/resolve', { url }, { signal })
      return normalizePreview(raw ?? {})
   },

   /** Start matching + queueing in the background; poll `getImport` after. */
   startImport: (
      payload: { url: string; limit?: number; format?: string; quality?: string }
   ): Promise<SpotifyImportState> =>
      api.post<SpotifyImportState>('/downloads/spotify', payload),

   getImport: (id: string): Promise<SpotifyImportState> =>
      api.get<SpotifyImportState>(`/downloads/spotify/${encodeURIComponent(id)}`, NO_REDIRECT)
}
