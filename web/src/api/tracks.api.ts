import { api } from './client.api'
import { API_BASE } from '@/lib/constants'
import { tracksStore, likedStore, historyStore } from '@/lib/localDb'
import { scanLocalMusic } from '@/lib/localFs'
import { isOnline } from '@/lib/network'
import type { Track } from '@/types/track.types'

/**
 * Tracks API — offline-first with automatic backend sync.
 *
 * Reads are served from IndexedDB first (instant, works offline).
 * Writes go to the backend when online, or get queued for later when offline.
 * After a successful backend write, local IndexedDB is updated too.
 */

export const tracksApi = {
   // ── Reads (offline-first) ─────────────────────────────────

   getTrack: async (id: string): Promise<Track> => {
      // Check local IndexedDB first
      const local = await tracksStore.get(id);
      if (local) return local;

      // Fall back to API
      try {
         const track = await api.get<Track>(`/tracks/${id}`);
         // Cache in local DB for offline access
         await tracksStore.put(track);
         return track;
      } catch {
         throw new Error(`Track ${id} not found`);
      }
   },

   /**
    * Get all local library tracks.
    * Tries IndexedDB first, then falls back to the backend API.
    * On native platform, also scans the filesystem directly.
    */
   getAll: async (): Promise<Track[]> => {
      // 1. Check IndexedDB first (fastest)
      const cached = await tracksStore.getAll();
      if (cached.length > 0) return cached;

      // 2. On native platform, scan the filesystem directly
      if (!isOnline()) {
         const localFsTracks = await scanLocalMusic();
         if (localFsTracks.length > 0) {
            await tracksStore.putAll(localFsTracks);
            return localFsTracks;
         }
      }

      // 3. Fall back to backend API
      try {
         const tracks = await api.get<Track[]>('/tracks/');
         // Cache in IndexedDB
         if (tracks.length > 0) {
            await tracksStore.putAll(tracks);
         }
         return tracks;
      } catch {
         // If offline and no cache, try filesystem scan
         const localFsTracks = await scanLocalMusic();
         if (localFsTracks.length > 0) {
            await tracksStore.putAll(localFsTracks);
         }
         return localFsTracks;
      }
   },

   // ── Liked tracks (offline-first) ──────────────────────────

   likeTrack: async (id: string) => {
      // Optimistic local update
      await likedStore.add(id);

      // Sync to backend (queued if offline)
      try {
         return await api.postQueued<{ liked: boolean; count: number }>(`/tracks/${id}/like`);
      } catch {
         // Will be synced later via offline queue
         return { liked: true, count: 0 };
      }
   },

   unlikeTrack: async (id: string) => {
      // Optimistic local update
      await likedStore.remove(id);

      // Sync to backend (queued if offline)
      try {
         return await api.deleteQueued<{ liked: boolean; count: number }>(`/tracks/${id}/like`);
      } catch {
         return { liked: false, count: 0 };
      }
   },

   getLiked: async (): Promise<Track[]> => {
      // 1. Get liked IDs from local DB
      const likedIds = await likedStore.getAll();

      if (!isOnline() && likedIds.length > 0) {
         // Offline — resolve from local track cache
         const tracks: Track[] = [];
         for (const id of likedIds) {
            const track = await tracksStore.get(id);
            if (track) {
               tracks.push({ ...track, isLiked: true });
            }
         }
         return tracks;
      }

      // Online — fetch from backend (most up-to-date)
      try {
         const tracks = await api.get<Track[]>('/tracks/liked');
         // Update local cache
         const txLiked: string[] = [];
         for (const track of tracks) {
            await tracksStore.put({ ...track, isLiked: true });
            txLiked.push(track.id);
         }
         // Sync liked IDs
         await likedStore.clear();
         for (const id of txLiked) {
            await likedStore.add(id);
         }
         return tracks;
      } catch {
         // Fallback to local
         const tracks: Track[] = [];
         for (const id of likedIds) {
            const track = await tracksStore.get(id);
            if (track) tracks.push({ ...track, isLiked: true });
         }
         return tracks;
      }
   },

   getLikedCount: async (): Promise<number> => {
      // 1. Local count (instant)
      const localCount = await likedStore.count();

      if (!isOnline()) return localCount;

      // 2. Online — get accurate count from backend
      try {
         const result = await api.get<{ count: number }>('/tracks/liked/count');
         return result.count;
      } catch {
         return localCount;
      }
   },

   // ── Recently played (offline-first) ───────────────────────

   getRecentlyPlayed: async (limit = 20): Promise<Track[]> => {
      // 1. Get recent track IDs from local history
      const recentIds = await historyStore.getRecent(limit);

      if (!isOnline() && recentIds.length > 0) {
         // Offline — resolve from local track cache
         const tracks: Track[] = [];
         for (const id of recentIds) {
            const track = await tracksStore.get(id);
            if (track) tracks.push(track);
         }
         return tracks;
      }

      // 2. Online — fetch from backend
      try {
         const tracks = await api.get<Track[]>('/tracks/recently-played', { params: { limit } });
         // Cache tracks locally
         if (tracks.length > 0) {
            await tracksStore.putAll(tracks);
         }
         return tracks;
      } catch {
         // Fallback to local
         const tracks: Track[] = [];
         for (const id of recentIds) {
            const track = await tracksStore.get(id);
            if (track) tracks.push(track);
         }
         return tracks;
      }
   },

   getTrending: async (limit = 20): Promise<Track[]> => {
      if (!isOnline()) return [];

      try {
         const tracks = await api.get<Track[]>('/tracks/trending', { params: { limit } });
         if (tracks.length > 0) {
            await tracksStore.putAll(tracks);
         }
         return tracks;
      } catch {
         return [];
      }
   },

   // ── Write operations (queued if offline) ──────────────────

   recordPlay: async (id: string) => {
      // Always record locally first
      await historyStore.add(id);
      await tracksStore.put({
         ...(await tracksStore.get(id) ?? {} as Track),
         id,
      } as Track);

      // Sync to backend (queued if offline)
      try {
         await api.postQueued<void>(`/tracks/${id}/play`);
      } catch {
         // Will be synced later
      }
   },

   clearHistory: async () => {
      await historyStore.clear();
      try {
         return await api.delete<{ ok: boolean }>('/tracks/history');
      } catch {
         return { ok: true };
      }
   },

   /**
    * Full absolute stream URL — works both in dev (Vite proxy) and prod (Render).
    */
   getStreamUrl: (id: string) => `${API_BASE}/stream/${id}/audio`,
}
