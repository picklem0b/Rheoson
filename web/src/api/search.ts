import { api } from './client'
import type { SearchResults, SearchFilter } from '@/types/search'
import type { Track } from '@/types/track'
import type { Playlist } from '@/types/playlist'

// ── Resolve response ──────────────────────────────────────────
// The /search/resolve endpoint returns different shapes depending on what
// was passed (track URL → single track, album/playlist URL → collection).

export type ResolveResult =
  | { type: 'track';    track:    Track                      }
  | { type: 'album';    tracks:   Track[];  title: string    }
  | { type: 'playlist'; tracks:   Track[];  title: string    }
  | { type: 'tracks';   tracks:   Track[]                    }

// ── API ───────────────────────────────────────────────────────

export const searchApi = {
  search: (
    query:  string,
    filter?: Exclude<SearchFilter, 'all'>,
    signal?: AbortSignal,
  ) =>
    api.get<SearchResults>('/search', {
      params: { q: query, ...(filter ? { filter } : {}) },
      signal,
    }),

  getSuggestions: (query: string, signal?: AbortSignal): Promise<string[]> =>
    api.get<string[]>('/search/suggest', {
      params: { q: query },
      signal,
    }),

  resolve: (url: string, signal?: AbortSignal) =>
    api.post<ResolveResult>('/search/resolve', { url }, { signal }),
}

// ── Normalise resolve result → Track[] ────────────────────────
// Centralises the "what shape did we get back?" logic so useSearch
// doesn't need to handle it with `any` casts.

export function resolveToTracks(result: ResolveResult): Track[] {
  switch (result.type) {
    case 'track':    return [result.track]
    case 'album':
    case 'playlist':
    case 'tracks':   return result.tracks
  }
}
