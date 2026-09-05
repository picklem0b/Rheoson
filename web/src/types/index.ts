/**
 * Type contract between backend and frontend.
 *
 * Source of truth: api/app/schemas/*.py → OpenAPI → openapi-typescript → here.
 * Run `npm run generate:types` after changing any Pydantic schema.
 *
 * DO NOT hand-edit these re-exports. Edit the Pydantic models instead.
 */
import type { components } from './api-generated'

// ── Friendly aliases ──────────────────────────────────────────
// These map the verbose generated paths to the short names
// used across the frontend codebase.

/** A music artist. */
export type Artist = Omit<components['schemas']['ArtistSchema'], 'topTracks' | 'albums'> & {
   topTracks: Track[]
   albums: Album[]
}

/** A music album. */
export type Album = Omit<components['schemas']['AlbumSchema'], 'tracks'> & {
   tracks: Track[]
}

/** A single music track. */
export type Track = components['schemas']['TrackSchema']

/** A user playlist. */
export type Playlist = components['schemas']['PlaylistSchema']

/** A playlist search result (lighter than full Playlist). */
export type PlaylistResult = components['schemas']['PlaylistResultSchema']

/** Full search results. */
export type SearchResults = components['schemas']['SearchResultsSchema']

/** URL resolve response. */
export type ResolveResponse = components['schemas']['ResolveResponseSchema']

/** A download job. */
export type DownloadJob = components['schemas']['DownloadJobSchema']

/** Download request payload. */
export type DownloadRequest = components['schemas']['DownloadRequestSchema']

/** Download status enum. */
export type DownloadStatus = components['schemas']['DownloadJobSchema']['status']

/** Audio format enum. */
export type AudioFormat = components['schemas']['DownloadJobSchema']['format']

/** Audio quality enum. */
export type AudioQuality = components['schemas']['DownloadJobSchema']['quality']

/** Lyrics response. */
export type Lyrics = components['schemas']['LyricsSchema']

/** A single lyrics line. */
export type LyricsLine = components['schemas']['LyricsLineSchema']

/** Login request. */
export type LoginRequest = components['schemas']['LoginRequest']

/** Register request. */
export type RegisterRequest = components['schemas']['RegisterRequest']

// ── Extended types ────────────────────────────────────────────
// Types that aren't in the API schema but are used in the frontend.

export type RepeatMode = 'off' | 'all' | 'one'

export interface PlayerState {
  isPlaying: boolean
  volume: number
  isMuted: boolean
  progress: number
  duration: number
  repeatMode: RepeatMode
  isShuffled: boolean
  isLoading: boolean
  showQueue: boolean
  showLyrics: boolean
  showFullscreen: boolean
}

export type SearchFilter = 'all' | 'tracks' | 'albums' | 'artists' | 'playlists'

export interface SearchSuggestion {
  id: string
  text: string
  type: 'recent' | 'trending'
}

export type FileNaming = 'artist-title' | 'title-artist' | 'id'

export interface DownloadOptions {
  format: AudioFormat
  quality: AudioQuality
  embedArtwork: boolean
  embedLyrics: boolean
  // Advanced options — defaults come from Settings → Downloads
  embedMetadata?: boolean
  fileNaming?: FileNaming
  customPath?: string
  retries?: number
  speedLimit?: number
  concurrency?: number
}

// ── API path types (for type-safe fetch calls) ────────────────
export type { paths } from './api-generated'
