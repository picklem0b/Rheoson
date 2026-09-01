import { api } from './client.api'
import { playlistsStore } from '@/lib/localDb'
import { isOnline } from '@/lib/network'
import { normalizePlaylist, normalizePlaylists, normalizeTracks } from '@/lib/normalize'
import type { Playlist } from '@/types/playlist.types'
import type { Track } from '@/types/track.types'

/**
 * Playlists API — offline-first with automatic backend sync.
 *
 * Reads from IndexedDB first (instant, works offline).
 * Writes go to the backend when online, or get queued for later.
 * Local state is always updated optimistically.
 */

export const playlistsApi = {
   // ── Reads (offline-first) ─────────────────────────────────

   getPlaylists: async (): Promise<Playlist[]> => {
      // 1. Check local cache first
      const cached = await playlistsStore.getAll();
      if (cached.length > 0 && !isOnline()) return cached;

      // 2. Online — fetch from backend
      try {
         const raw = await api.get<unknown[]>('/playlists');
         const playlists = normalizePlaylists(raw);
         // Update local cache
         if (playlists.length > 0) {
            await playlistsStore.putAll(playlists);
         }
         return playlists;
      } catch {
         return cached;
      }
   },

   getPlaylist: async (id: string): Promise<Playlist> => {
      // 1. Check local cache first
      const cached = await playlistsStore.get(id);
      if (cached && !isOnline()) return cached;

      // 2. Online — fetch from backend
      try {
         const raw = await api.get<unknown>(`/playlists/${id}`);
         const playlist = normalizePlaylist(raw);
         await playlistsStore.put(playlist);
         return playlist;
      } catch {
         if (cached) return cached;
         throw new Error(`Playlist ${id} not found`);
      }
   },

   // ── Writes (optimistic + offline-queued) ──────────────────

   createPlaylist: async (data: { title: string; description?: string }): Promise<Playlist> => {
      // Create a local playlist immediately
      const localPlaylist: Playlist = {
         id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
         title: data.title,
         description: data.description,
         tracks: [],
         trackCount: 0,
         isLocal: true,
         artworkUrl: '',
         createdAt: new Date().toISOString(),
         updatedAt: new Date().toISOString(),
      };

      // Save locally first
      await playlistsStore.put(localPlaylist);

      // Sync to backend (queued if offline)
      try {
         const remote = await api.postQueued<Playlist>('/playlists', data);
         // Replace local ID with server-assigned ID
         if (remote?.id) {
            await playlistsStore.delete(localPlaylist.id);
            await playlistsStore.put({ ...remote, tracks: [] });
            return remote;
         }
      } catch {
         // Will be synced later
      }

      return localPlaylist;
   },

   updatePlaylist: async (id: string, data: Partial<Pick<Playlist, 'title' | 'description'>>): Promise<Playlist> => {
      // Optimistic local update
      const local = await playlistsStore.get(id);
      if (local) {
         const updated = { ...local, ...data, updatedAt: new Date().toISOString() };
         await playlistsStore.put(updated);
      }

      try {
         const remote = await api.patchQueued<Playlist>(`/playlists/${id}`, data);
         if (remote?.id) {
            await playlistsStore.put(remote);
            return remote;
         }
      } catch {
         // Will be synced later
      }

      return local!;
   },

   deletePlaylist: async (id: string): Promise<void> => {
      // Optimistic local delete
      await playlistsStore.delete(id);

      try {
         await api.deleteQueued(`/playlists/${id}`);
      } catch {
         // Will be synced later
      }
   },

   addTrack: async (playlistId: string, trackId: string): Promise<void> => {
      // Optimistic local update
      const local = await playlistsStore.get(playlistId);
      if (local) {
         const trackIds = local.tracks.map((t) => t.id);
         if (!trackIds.includes(trackId)) {
            // We only have the trackId, not the full track — store ID in tracks array
            const updatedTracks = [...local.tracks, { id: trackId } as Track];
            await playlistsStore.put({
               ...local,
               tracks: updatedTracks,
               trackCount: updatedTracks.length,
               updatedAt: new Date().toISOString(),
            });
         }
      }

      try {
         await api.postQueued(`/playlists/${playlistId}/tracks`, { trackId });
      } catch {
         // Will be synced later
      }
   },

   removeTrack: async (playlistId: string, trackId: string): Promise<void> => {
      // Optimistic local update
      const local = await playlistsStore.get(playlistId);
      if (local) {
         const updatedTracks = local.tracks.filter((t) => t.id !== trackId);
         await playlistsStore.put({
            ...local,
            tracks: updatedTracks,
            trackCount: updatedTracks.length,
            updatedAt: new Date().toISOString(),
         });
      }

      try {
         await api.deleteQueued(`/playlists/${playlistId}/tracks/${trackId}`);
      } catch {
         // Will be synced later
      }
   },

   reorderTracks: async (playlistId: string, trackIds: string[]): Promise<void> => {
      try {
         await api.put(`/playlists/${playlistId}/tracks/reorder`, { trackIds });
      } catch {
         // Will be synced later
      }
   },

   importSpotify: async (spotifyUrl: string): Promise<Playlist> => {
      return api.post<Playlist>('/playlists/import', { url: spotifyUrl });
   },

   getTracks: async (playlistId: string): Promise<Track[]> => {
      // 1. Local first
      const local = await playlistsStore.get(playlistId);
      if (local && local.tracks.length > 0 && !isOnline()) {
         return local.tracks;
      }

      // 2. Online
      try {
         const raw = await api.get<unknown[]>(`/playlists/${playlistId}/tracks`);
         const tracks = normalizeTracks(raw);
         // Update local cache with hydrated tracks
         if (local && tracks.length > 0) {
            await playlistsStore.put({
               ...local,
               tracks,
               trackCount: tracks.length,
            });
         }
         return tracks;
      } catch {
         return local?.tracks ?? [];
      }
   },
}

// Named re-exports so pages can do:
//   import { getPlaylists, getPlaylist } from '@/api/playlists.api'
export const {
   getPlaylists,
   getPlaylist,
   createPlaylist,
   updatePlaylist,
   deletePlaylist,
   addTrack,
   removeTrack,
   reorderTracks,
   importSpotify,
} = playlistsApi
