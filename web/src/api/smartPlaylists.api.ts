import { api } from './client.api'
import type { Track } from '@/types/track.types'

export interface SmartPlaylist {
  title: string
  subtitle?: string
  tracks: Track[]
  generated_at: string
}

export const smartPlaylistsApi = {
  getMostPlayed: (days = 30, limit = 25) =>
    api.get<SmartPlaylist>('/smart-playlists/most-played', {
      params: { days: String(days), limit: String(limit) }
    }),

  getRecentlyAdded: (limit = 25) =>
    api.get<SmartPlaylist>('/smart-playlists/recently-added', {
      params: { limit: String(limit) }
    }),

  getDiscover: (limit = 20) =>
    api.get<SmartPlaylist>('/smart-playlists/discover', {
      params: { limit: String(limit) }
    }),

  getTimeCapsule: (daysAgo = 30) =>
    api.get<SmartPlaylist>('/smart-playlists/time-capsule', {
      params: { days_ago: String(daysAgo) }
    }),
}
