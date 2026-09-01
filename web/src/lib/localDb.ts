/**
 * Local database — IndexedDB wrapper for offline-first data storage.
 *
 * Stores tracks, playlists, liked songs, play history, and a sync queue
 * so the app works fully offline. When the backend comes back online,
 * the sync queue replays pending mutations.
 *
 * Uses the `idb` library (Promise-based IndexedDB wrapper) for clean
 * async/await access.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { Track } from '@/types/track.types';
import type { Playlist } from '@/types/playlist.types';

// ── Types ──────────────────────────────────────────────────────

export interface HistoryEntry {
   id: string;
   trackId: string;
   playedAt: string;
}

export interface SyncQueueItem {
   id: string;
   type: 'like' | 'unlike' | 'create-playlist' | 'delete-playlist' | 'add-track' | 'remove-track' | 'record-play' | 'update-playlist';
   payload: Record<string, unknown>;
   endpoint: string;
   method: string;
   createdAt: string;
}

interface RheosonDB {
   tracks: {
      key: string;
      value: Track;
      indexes: { 'by-artist': string; 'by-album': string };
   };
   playlists: {
      key: string;
      value: Playlist;
   };
   liked: {
      key: string; // track ID
      value: { trackId: string; addedAt: string };
   };
   history: {
      key: string;
      value: HistoryEntry;
      indexes: { 'by-date': string };
   };
   syncQueue: {
      key: string;
      value: SyncQueueItem;
   };
}

// ── Database singleton ─────────────────────────────────────────

let _dbPromise: Promise<IDBPDatabase<RheosonDB>> | null = null;

function _getDb(): Promise<IDBPDatabase<RheosonDB>> {
   if (!_dbPromise) {
      _dbPromise = openDB<RheosonDB>('rheoson-offline', 1, {
         upgrade(db) {
            // Tracks store
            if (!db.objectStoreNames.contains('tracks')) {
               const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
               trackStore.createIndex('by-artist', 'artist.name');
               trackStore.createIndex('by-album', 'album.title');
            }

            // Playlists store
            if (!db.objectStoreNames.contains('playlists')) {
               db.createObjectStore('playlists', { keyPath: 'id' });
            }

            // Liked tracks store
            if (!db.objectStoreNames.contains('liked')) {
               db.createObjectStore('liked', { keyPath: 'trackId' });
            }

            // Play history store
            if (!db.objectStoreNames.contains('history')) {
               const historyStore = db.createObjectStore('history', { keyPath: 'id' });
               historyStore.createIndex('by-date', 'playedAt');
            }

            // Sync queue — pending mutations when offline
            if (!db.objectStoreNames.contains('syncQueue')) {
               db.createObjectStore('syncQueue', { keyPath: 'id' });
            }
         },
      });
   }
   return _dbPromise;
}

// ── Track operations ───────────────────────────────────────────

export const tracksStore = {
   async putAll(tracks: Track[]): Promise<void> {
      const db = await _getDb();
      const tx = db.transaction('tracks', 'readwrite');
      for (const track of tracks) {
         tx.store.put(track);
      }
      await tx.done;
   },

   async put(track: Track): Promise<void> {
      const db = await _getDb();
      await db.put('tracks', track);
   },

   async get(id: string): Promise<Track | undefined> {
      const db = await _getDb();
      return db.get('tracks', id);
   },

   async getAll(): Promise<Track[]> {
      const db = await _getDb();
      return db.getAll('tracks');
   },

   async delete(id: string): Promise<void> {
      const db = await _getDb();
      await db.delete('tracks', id);
   },

   async clear(): Promise<void> {
      const db = await _getDb();
      await db.clear('tracks');
   },

   async count(): Promise<number> {
      const db = await _getDb();
      return db.count('tracks');
   },

   async search(query: string): Promise<Track[]> {
      const db = await _getDb();
      const all = await db.getAll('tracks');
      const q = query.toLowerCase();
      return all.filter(
         (t) =>
            t.title.toLowerCase().includes(q) ||
            (t.artist?.name ?? '').toLowerCase().includes(q) ||
            (t.album?.title ?? '').toLowerCase().includes(q)
      );
   },
};

// ── Playlist operations ────────────────────────────────────────

export const playlistsStore = {
   async putAll(playlists: Playlist[]): Promise<void> {
      const db = await _getDb();
      const tx = db.transaction('playlists', 'readwrite');
      for (const pl of playlists) {
         tx.store.put(pl);
      }
      await tx.done;
   },

   async put(playlist: Playlist): Promise<void> {
      const db = await _getDb();
      await db.put('playlists', playlist);
   },

   async get(id: string): Promise<Playlist | undefined> {
      const db = await _getDb();
      return db.get('playlists', id);
   },

   async getAll(): Promise<Playlist[]> {
      const db = await _getDb();
      return db.getAll('playlists');
   },

   async delete(id: string): Promise<void> {
      const db = await _getDb();
      await db.delete('playlists', id);
   },

   async clear(): Promise<void> {
      const db = await _getDb();
      await db.clear('playlists');
   },
};

// ── Liked tracks operations ────────────────────────────────────

export const likedStore = {
   async add(trackId: string): Promise<void> {
      const db = await _getDb();
      await db.put('liked', { trackId, addedAt: new Date().toISOString() });
   },

   async remove(trackId: string): Promise<void> {
      const db = await _getDb();
      await db.delete('liked', trackId);
   },

   async has(trackId: string): Promise<boolean> {
      const db = await _getDb();
      const item = await db.get('liked', trackId);
      return item != null;
   },

   async getAll(): Promise<string[]> {
      const db = await _getDb();
      const items = await db.getAll('liked');
      return items.map((i) => i.trackId);
   },

   async count(): Promise<number> {
      const db = await _getDb();
      return db.count('liked');
   },

   async clear(): Promise<void> {
      const db = await _getDb();
      await db.clear('liked');
   },
};

// ── Play history operations ────────────────────────────────────

export const historyStore = {
   async add(trackId: string): Promise<void> {
      const db = await _getDb();
      const id = `${trackId}-${Date.now()}`;
      await db.put('history', {
         id,
         trackId,
         playedAt: new Date().toISOString(),
      });

      // Keep only last 500 entries
      const all = await db.getAll('history');
      if (all.length > 500) {
         const sorted = all.sort(
            (a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime()
         );
         const toDelete = sorted.slice(0, all.length - 500);
         const tx = db.transaction('history', 'readwrite');
         for (const entry of toDelete) {
            tx.store.delete(entry.id);
         }
         await tx.done;
      }
   },

   async getRecent(limit = 20): Promise<string[]> {
      const db = await _getDb();
      const all = await db.getAll('history');
      const sorted = all.sort(
         (a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime()
      );
      // Deduplicate — only keep most recent play per track
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const entry of sorted) {
         if (!seen.has(entry.trackId)) {
            seen.add(entry.trackId);
            unique.push(entry.trackId);
            if (unique.length >= limit) break;
         }
      }
      return unique;
   },

   async clear(): Promise<void> {
      const db = await _getDb();
      await db.clear('history');
   },
};

// ── Sync queue operations ──────────────────────────────────────

export const syncQueueStore = {
   async add(item: Omit<SyncQueueItem, 'id' | 'createdAt'>): Promise<void> {
      const db = await _getDb();
      await db.put('syncQueue', {
         ...item,
         id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
         createdAt: new Date().toISOString(),
      });
   },

   async getAll(): Promise<SyncQueueItem[]> {
      const db = await _getDb();
      const items = await db.getAll('syncQueue');
      return items.sort(
         (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
   },

   async remove(id: string): Promise<void> {
      const db = await _getDb();
      await db.delete('syncQueue', id);
   },

   async clear(): Promise<void> {
      const db = await _getDb();
      await db.clear('syncQueue');
   },

   async count(): Promise<number> {
      const db = await _getDb();
      return db.count('syncQueue');
   },
};
