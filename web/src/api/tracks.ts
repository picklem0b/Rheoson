import { api } from './client'
import type { Track } from '@/types/track'

export const tracksApi = {
  getTrack: (id: string) =>
    api.get<Track>(`/tracks/${id}`),

  likeTrack: (id: string) =>
    api.post<{ liked: boolean }>(`/tracks/${id}/like`),

  unlikeTrack: (id: string) =>
    api.delete<{ liked: boolean }>(`/tracks/${id}/like`),

  getLiked: () =>
    api.get<Track[]>('/tracks/liked'),

  getRecentlyPlayed: () =>
    api.get<Track[]>('/tracks/recently-played'),

  recordPlay: (id: string) =>
    api.post<void>(`/tracks/${id}/play`),

  getStreamUrl: (id: string) =>
    `/api/stream/${id}`,
}