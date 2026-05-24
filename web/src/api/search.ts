import { api } from './client'
import type { SearchResults } from '@/types/search'
import type { Track } from '@/types/track'

export const searchApi = {
  search: (query: string, filter?: string) =>
    api.get<SearchResults>('/search', {
      params: { q: query, ...(filter ? { filter } : {}) },
    }),

  getSuggestions: (query: string): Promise<string[]> =>
    api.get<string[]>('/search/suggest', {
      params: { q: query },
    }),

  resolve: (url: string) =>
    api.post<any>('/search/resolve', { url }),
}