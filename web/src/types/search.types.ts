import type { Track } from './track.types'
import type { Album } from './track.types'
import type { Artist } from './track.types'
import type { Playlist } from './playlist.types'

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