import { api } from './client'
import { API_BASE } from '@/lib/constants'
import type { Track } from '@/types/track'

export const tracksApi = {
  getTrack: (id: string) =>
    api.get<Track>(`/tracks/${id}`),

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

  /**
   * Full absolute stream URL — works both in dev (Vite proxy) and prod (Render).
   * In dev: /api/stream/{id}/audio → proxied to localhost:8000
   * In prod: https://shulker-api.onrender.com/api/stream/{id}/audio
   * Using API_BASE directly so there's no relative-URL mismatch when the
   * frontend and API are on different origins in production.
   */
  getStreamUrl: (id: string) => `${API_BASE}/stream/${id}/audio`,
}