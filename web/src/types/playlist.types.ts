import type { Track } from './track.types'

export interface Playlist {
  id: string
  title: string
  description?: string
  artworkUrl?: string
  tracks: Track[]
  trackCount: number
  isLocal: boolean        // user-created vs imported
  spotifyId?: string
  totalDuration?: number  // seconds, computed by the server when it can
  createdAt: string
  updatedAt: string
}