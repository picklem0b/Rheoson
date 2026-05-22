import type { Track } from './track'
import type { Album } from './track'
import type { Artist } from './track'
import type { Playlist } from './playlist'

export type SearchFilter = 'all' | 'tracks' | 'albums' | 'artists' | 'playlists'

export interface SearchResults {
  tracks: Track[]
  albums: Album[]
  artists: Artist[]
  playlists: Playlist[]
  query: string
}

export interface SearchSuggestion {
  id: string
  text: string
  type: 'recent' | 'trending'
}