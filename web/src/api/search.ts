import { api } from './client'
import type { SearchResults } from '@/types/search'
import type { Track } from '@/types/track'

export const searchApi = {
  // Search YouTube Music + local library
  search: (query: string, filter?: string) =>
    api.get<SearchResults>('/search', {
      params: { q: query, ...(filter ? { filter } : {}) },
    }),

  // Search YouTube directly
  searchYouTube: (query: string) =>
    api.get<Track[]>('/search/youtube', {
      params: { q: query },
    }),

  // Resolve a Spotify or YouTube URL
  resolve: (url: string) =>
    api.post<Track | Track[]>('/search/resolve', { url }),
}