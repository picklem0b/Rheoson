import { api } from './client'
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

  /** Returns just the count — cheap call for the Library pinned card. */
  getLikedCount: () =>
    api.get<{ count: number }>('/tracks/liked/count').then((r) => r.count),

  getRecentlyPlayed: (limit = 20) =>
    api.get<Track[]>('/tracks/recently-played', { params: { limit } }),

  getTrending: (limit = 20) =>
    api.get<Track[]>('/tracks/trending', { params: { limit } }),

  recordPlay: (id: string) =>
    api.post<void>(`/tracks/${id}/play`),

  /**
   * Audio stream URL.
   * Uses the Vite proxy path so it works in dev (proxy → localhost:8000)
   * and in prod (same origin or Render URL from env).
   */
  getStreamUrl: (id: string) => `/api/stream/${id}/audio`,
}
