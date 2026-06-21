import { api } from './client'
import { API_BASE } from '@/lib/constants'
import type { Track } from '@/types/track'

/**
 * Tracks API
 * ==========
 * Wraps every /api/tracks/* endpoint. Each method maps 1:1 to a backend
 * route — see api/app/routers/tracks.py for the server-side implementation.
 */
export const tracksApi = {
  getTrack: (id: string) =>
    api.get<Track>(`/tracks/${id}`),

  // Full local library — every file currently in MUSIC_DIR.
  getAll: () =>
    api.get<Track[]>('/tracks/'),

  likeTrack: (id: string) =>
    api.post<{ liked: boolean; count: number }>(`/tracks/${id}/like`),

  unlikeTrack: (id: string) =>
    api.delete<{ liked: boolean; count: number }>(`/tracks/${id}/like`),

  getLiked: () =>
    api.get<Track[]>('/tracks/liked'),

  getLikedCount: () =>
    api.get<{ count: number }>('/tracks/liked/count').then((r) => r.count),

  getRecentlyPlayed: (limit = 20) =>
    api.get<Track[]>('/tracks/recently-played', { params: { limit } }),

  getTrending: (limit = 20) =>
    api.get<Track[]>('/tracks/trending', { params: { limit } }),

  recordPlay: (id: string) =>
    api.post<void>(`/tracks/${id}/play`),

  /** Wipes the play history file on the server. Used by "Clear history". */
  clearHistory: () =>
    api.delete<{ ok: boolean }>('/tracks/history'),

  /**
   * Full absolute stream URL — works both in dev (Vite proxy) and prod (Render).
   * Using API_BASE directly avoids a relative-URL mismatch when the frontend
   * and API are hosted on different origins in production.
   */
  getStreamUrl: (id: string) => `${API_BASE}/stream/${id}/audio`,
}