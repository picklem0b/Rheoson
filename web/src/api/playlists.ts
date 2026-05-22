import { api } from './client'
import type { Playlist } from '@/types/playlist'
import type { Track } from '@/types/track'

export const playlistsApi = {
  getPlaylists: () =>
    api.get<Playlist[]>('/playlists'),

  getPlaylist: (id: string) =>
    api.get<Playlist>(`/playlists/${id}`),

  createPlaylist: (data: { title: string; description?: string }) =>
    api.post<Playlist>('/playlists', data),

  updatePlaylist: (id: string, data: Partial<Pick<Playlist, 'title' | 'description'>>) =>
    api.patch<Playlist>(`/playlists/${id}`, data),

  deletePlaylist: (id: string) =>
    api.delete<void>(`/playlists/${id}`),

  addTrack: (playlistId: string, trackId: string) =>
    api.post<void>(`/playlists/${playlistId}/tracks`, { trackId }),

  removeTrack: (playlistId: string, trackId: string) =>
    api.delete<void>(`/playlists/${playlistId}/tracks/${trackId}`),

  reorderTracks: (playlistId: string, trackIds: string[]) =>
    api.put<void>(`/playlists/${playlistId}/tracks/reorder`, { trackIds }),

  importSpotify: (spotifyUrl: string) =>
    api.post<Playlist>('/playlists/import', { url: spotifyUrl }),

  getTracks: (playlistId: string) =>
    api.get<Track[]>(`/playlists/${playlistId}/tracks`),
}