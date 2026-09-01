/**
 * Data normalization layer — the single source of truth for runtime data shapes.
 *
 * Backend API responses can violate TypeScript types at runtime:
 * - `artist` can be undefined, null, or a string instead of an object
 * - `album` can be missing entirely
 * - `artworkUrl` can be null or missing
 * - Fields can have wrong types (duration as string, etc.)
 *
 * Every API client method MUST run its response through these normalizers
 * before returning to components. This guarantees that components receive
 * predictable, complete data objects.
 *
 * Components should STILL use optional chaining as a defense-in-depth measure,
 * but these normalizers are the primary safety net.
 */

import type { Track, Artist, Album } from '@/types/track.types';
import type { Playlist } from '@/types/playlist.types';

// ── Default fallback objects ───────────────────────────────────

const DEFAULT_ARTIST: Artist = {
   id: 'unknown',
   name: 'Unknown Artist',
   imageUrl: '',
};

const DEFAULT_ALBUM: Album = {
   id: 'unknown',
   title: 'Unknown Album',
   artist: DEFAULT_ARTIST,
   artworkUrl: '',
   releaseYear: 0,
   trackCount: 0,
};

// ── Normalize Artist ───────────────────────────────────────────

/**
 * Normalize an artist object from raw API data.
 * Handles: missing artist, artist as string, artist with missing fields.
 */
export function normalizeArtist(raw: unknown): Artist {
   if (!raw) return { ...DEFAULT_ARTIST };

   // Artist might be a plain string (e.g. from older API responses)
   if (typeof raw === 'string') {
      return {
         id: raw.toLowerCase().replace(/\s+/g, '-'),
         name: raw,
         imageUrl: '',
      };
   }

   if (typeof raw === 'object') {
      const a = raw as Record<string, unknown>;
      return {
         id: String(a.id ?? a._id ?? 'unknown'),
         name: String(a.name ?? 'Unknown Artist'),
         imageUrl: String(a.imageUrl ?? a.image ?? ''),
         genres: Array.isArray(a.genres) ? a.genres as string[] : undefined,
         followers: typeof a.followers === 'number' ? a.followers : undefined,
         monthlyListeners: typeof a.monthlyListeners === 'number' ? a.monthlyListeners : undefined,
      };
   }

   return { ...DEFAULT_ARTIST };
}

// ── Normalize Album ────────────────────────────────────────────

/**
 * Normalize an album object from raw API data.
 * Handles: missing album, album with missing artist, nested fields.
 */
export function normalizeAlbum(raw: unknown): Album {
   if (!raw || typeof raw !== 'object') return { ...DEFAULT_ALBUM };

   const a = raw as Record<string, unknown>;

   return {
      id: String(a.id ?? a._id ?? 'unknown'),
      title: String(a.title ?? a.name ?? 'Unknown Album'),
      artist: normalizeArtist(a.artist),
      artworkUrl: String(a.artworkUrl ?? a.artwork ?? a.image ?? ''),
      releaseYear: typeof a.releaseYear === 'number' ? a.releaseYear
         : typeof a.year === 'number' ? a.year
         : 0,
      year: typeof a.year === 'number' ? a.year : undefined,
      trackCount: typeof a.trackCount === 'number' ? a.trackCount : 0,
      tracks: Array.isArray(a.tracks) ? a.tracks.map(normalizeTrack) : undefined,
   };
}

// ── Normalize Track ────────────────────────────────────────────

/**
 * Normalize a track object from raw API data.
 * This is the MOST critical normalizer — every track from every API
 * endpoint must pass through here.
 *
 * Handles:
 * - Missing artist → DEFAULT_ARTIST
 * - Missing album → DEFAULT_ALBUM
 * - Artist as string → converted to Artist object
 * - Missing artworkUrl → empty string
 * - Duration as string → parsed to number
 * - Missing boolean flags → false
 */
export function normalizeTrack(raw: unknown): Track {
   if (!raw || typeof raw !== 'object') {
      // Return a minimal valid track so rendering never crashes
      return {
         id: `unknown-${Date.now()}`,
         title: 'Unknown Track',
         artist: { ...DEFAULT_ARTIST },
         album: { ...DEFAULT_ALBUM },
         artworkUrl: '',
         duration: 0,
         isDownloaded: false,
         isLiked: false,
      };
   }

   const t = raw as Record<string, unknown>;

   // Normalize artist — handle string, object, or missing
   const artist = normalizeArtist(t.artist);

   // Normalize album — handle missing or malformed
   const albumRaw = t.album;
   let album: Album;
   if (albumRaw && typeof albumRaw === 'object') {
      album = normalizeAlbum(albumRaw);
      // Ensure album.artist is set (inherit from track artist if missing)
      if (!album.artist || album.artist.id === 'unknown') {
         album.artist = { ...artist };
      }
   } else {
      album = {
         ...DEFAULT_ALBUM,
         artist: { ...artist },
      };
   }

   // Parse duration — handle string, number, or missing
   let duration = 0;
   if (typeof t.duration === 'number') {
      duration = t.duration;
   } else if (typeof t.duration === 'string') {
      // Handle "3:45" or "03:45" format
      const parts = t.duration.split(':').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
         duration = parts[0] * 60 + parts[1];
      } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
         duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
   }

   return {
      id: String(t.id ?? t.videoId ?? t._id ?? `unknown-${Date.now()}`),
      title: String(t.title ?? 'Unknown Track'),
      artist,
      album,
      artworkUrl: String(t.artworkUrl ?? t.artwork ?? t.thumbnail ?? t.image ?? ''),
      duration,
      streamUrl: typeof t.streamUrl === 'string' ? t.streamUrl : undefined,
      filePath: typeof t.filePath === 'string' ? t.filePath : undefined,
      isDownloaded: Boolean(t.isDownloaded),
      isLiked: Boolean(t.isLiked),
      youtubeId: typeof t.youtubeId === 'string' ? t.youtubeId : undefined,
      spotifyId: typeof t.spotifyId === 'string' ? t.spotifyId : undefined,
      addedAt: typeof t.addedAt === 'string' ? t.addedAt : undefined,
      trackNumber: typeof t.trackNumber === 'number' ? t.trackNumber : undefined,
      playCount: typeof t.playCount === 'number' ? t.playCount : undefined,
   };
}

// ── Normalize Playlist ─────────────────────────────────────────

export function normalizePlaylist(raw: unknown): Playlist {
   if (!raw || typeof raw !== 'object') {
      return {
         id: `unknown-${Date.now()}`,
         title: 'Unknown Playlist',
         tracks: [],
         trackCount: 0,
         isLocal: true,
         createdAt: '',
         updatedAt: '',
      };
   }

   const p = raw as Record<string, unknown>;

   // Tracks might be IDs (strings) or full Track objects
   let tracks: Track[] = [];
   if (Array.isArray(p.tracks)) {
      tracks = p.tracks.map((t: unknown) => {
         if (typeof t === 'string') {
            // Track ID only — create a minimal track
            return {
               id: t,
               title: 'Unknown Track',
               artist: { ...DEFAULT_ARTIST },
               album: { ...DEFAULT_ALBUM },
               artworkUrl: '',
               duration: 0,
               isDownloaded: false,
               isLiked: false,
            };
         }
         return normalizeTrack(t);
      });
   }

   return {
      id: String(p.id ?? p._id ?? `unknown-${Date.now()}`),
      title: String(p.title ?? 'Untitled Playlist'),
      description: typeof p.description === 'string' ? p.description : undefined,
      artworkUrl: typeof p.artworkUrl === 'string' ? p.artworkUrl : undefined,
      tracks,
      trackCount: typeof p.trackCount === 'number' ? p.trackCount
         : typeof p.trackCount === 'string' ? parseInt(p.trackCount, 10) || 0
         : tracks.length,
      isLocal: Boolean(p.isLocal),
      spotifyId: typeof p.spotifyId === 'string' ? p.spotifyId : undefined,
      totalDuration: typeof p.totalDuration === 'number' ? p.totalDuration : undefined,
      createdAt: String(p.createdAt ?? ''),
      updatedAt: String(p.updatedAt ?? ''),
   };
}

// ── Batch normalizers ──────────────────────────────────────────

/** Normalize an array of tracks, filtering out any that fail to normalize. */
export function normalizeTracks(raw: unknown[]): Track[] {
   if (!Array.isArray(raw)) return [];
   return raw.map(normalizeTrack).filter(t => t.id && t.id.startsWith('unknown-') === false || t.title !== 'Unknown Track');
}

/** Normalize an array of playlists. */
export function normalizePlaylists(raw: unknown[]): Playlist[] {
   if (!Array.isArray(raw)) return [];
   return raw.map(normalizePlaylist);
}

/** Normalize search results shape. */
export function normalizeSearchResults(raw: unknown): {
   tracks: Track[];
   albums: Album[];
   artists: Artist[];
   playlists: Playlist[];
   query: string;
} {
   if (!raw || typeof raw !== 'object') {
      return { tracks: [], albums: [], artists: [], playlists: [], query: '' };
   }

   const r = raw as Record<string, unknown>;

   return {
      tracks: Array.isArray(r.tracks) ? r.tracks.map(normalizeTrack) : [],
      albums: Array.isArray(r.albums) ? r.albums.map(normalizeAlbum) : [],
      artists: Array.isArray(r.artists) ? r.artists.map(normalizeArtist) : [],
      playlists: Array.isArray(r.playlists) ? r.playlists.map(normalizePlaylist) : [],
      query: String(r.query ?? ''),
   };
}

// ── Utility: safe nested access ────────────────────────────────

/**
 * Safely access nested properties that might be undefined/null.
 * Use this in components as a last resort when normalizers can't cover the case.
 */
export function safeGet<T>(obj: unknown, path: string, fallback: T): T {
   try {
      const parts = path.split('.');
      let current: unknown = obj;
      for (const part of parts) {
         if (current == null || typeof current !== 'object') return fallback;
         current = (current as Record<string, unknown>)[part];
      }
      return (current ?? fallback) as T;
   } catch {
      return fallback;
   }
}
