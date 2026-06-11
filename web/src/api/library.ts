import { api } from './client'
import type { Track } from '@/types/track'
import type { Album } from '@/types/album'
import type { Artist } from '@/types/artist'

// ── Shared response types ─────────────────────────────────────

export interface FeaturedItem {
  id:          string
  title:       string
  subtitle?:   string
  artworkUrl?: string
  type:        'playlist' | 'album'
}

// ── Library API ───────────────────────────────────────────────

export const libraryApi = {
  /** All albums derived from local library scan. */
  getAlbums: () =>
    api.get<Album[]>('/library/albums'),

  /** Single album with full track list. */
  getAlbum: (id: string) =>
    api.get<Album>(`/library/albums/${id}`),

  /** All artists derived from local library. */
  getArtists: () =>
    api.get<Artist[]>('/library/artists'),

  /** Single artist with topTracks + albums. */
  getArtist: (id: string) =>
    api.get<Artist>(`/library/artists/${id}`),

  /**
   * Featured playlists/albums for the Home page hero section.
   * Backend returns a curated mix of trending albums + user's most-played playlists.
   */
  getFeatured: (limit = 10) =>
    api.get<FeaturedItem[]>('/library/featured', { params: { limit } }),
}

// Named re-exports so pages can do:
//   import { getAlbum, getArtist, getFeatured } from '@/api/library'
export const {
  getAlbums,
  getAlbum,
  getArtists,
  getArtist,
  getFeatured,
} = libraryApi
