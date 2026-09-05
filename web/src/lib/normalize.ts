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

import type { Track, Artist, Album, Playlist, PlaylistResult } from '@/types/index'

// ── Default fallback objects ───────────────────────────────────

const DEFAULT_ARTIST: Artist = {
   id: 'unknown',
   name: 'Unknown Artist',
   imageUrl: '',
   genres: [],
   followers: 0,
   monthlyListeners: 0,
   description: '',
   subscribers: '',
   topTracks: [],
   albums: [],
}

const DEFAULT_ALBUM: Album = {
   id: 'unknown',
   title: 'Unknown Album',
   artist: DEFAULT_ARTIST,
   artworkUrl: '',
   releaseYear: 0,
   year: 0,
   trackCount: 0,
   tracks: [],
}

// ── Normalize Artist ───────────────────────────────────────────

/**
 * Normalize an artist object from raw API data.
 * Handles: missing artist, artist as string, artist with missing fields.
 */
export function normalizeArtist(raw: unknown): Artist {
   if (!raw) return { ...DEFAULT_ARTIST }

   // Artist might be a plain string (e.g. from older API responses)
   if (typeof raw === 'string') {
      return {
         id: raw.toLowerCase().replace(/\s+/g, '-'),
         name: raw,
         imageUrl: '',
         genres: [],
         followers: 0,
         monthlyListeners: 0,
         description: '',
         subscribers: '',
         topTracks: [],
         albums: [],
      }
   }

   if (typeof raw === 'object') {
      const a = raw as Record<string, unknown>
      return {
         id: String(a.id ?? a._id ?? 'unknown'),
         name: String(a.name ?? 'Unknown Artist'),
         imageUrl: String(a.imageUrl ?? a.image ?? ''),
         genres: Array.isArray(a.genres) ? (a.genres as string[]) : [],
         followers: typeof a.followers === 'number' ? a.followers : 0,
         monthlyListeners: typeof a.monthlyListeners === 'number' ? a.monthlyListeners : 0,
         description: typeof a.description === 'string' ? a.description : '',
         subscribers: typeof a.subscribers === 'string' ? a.subscribers : '',
         topTracks: Array.isArray(a.topTracks) ? a.topTracks.map(normalizeTrack) : [],
         albums: Array.isArray(a.albums) ? a.albums : [],
      }
   }

   return { ...DEFAULT_ARTIST }
}

// ── Normalize Album ────────────────────────────────────────────

/**
 * Normalize an album object from raw API data.
 * Handles: missing album, album with missing artist, nested fields.
 */
export function normalizeAlbum(raw: unknown): Album {
   if (!raw || typeof raw !== 'object') return { ...DEFAULT_ALBUM }

   const a = raw as Record<string, unknown>

   return {
      id: String(a.id ?? a._id ?? 'unknown'),
      title: String(a.title ?? a.name ?? 'Unknown Album'),
      artist: normalizeArtist(a.artist),
      artworkUrl: String(a.artworkUrl ?? a.artwork ?? a.image ?? ''),
      releaseYear: typeof a.releaseYear === 'number' ? a.releaseYear
         : typeof a.year === 'number' ? a.year
         : 0,
      year: typeof a.year === 'number' ? a.year : 0,
      trackCount: typeof a.trackCount === 'number' ? a.trackCount : 0,
      tracks: Array.isArray(a.tracks) ? a.tracks.map(normalizeTrack) : [],
   }
}

// ── Normalize Track ────────────────────────────────────────────

/**
 * Normalize a track object from raw API data.
 * This is the MOST critical normalizer — every track from every API
 * endpoint must pass through here.
 */
export function normalizeTrack(raw: unknown): Track {
   if (!raw || typeof raw !== 'object') {
      return {
         id: `unknown-${Date.now()}`,
         title: 'Unknown Track',
         artist: { ...DEFAULT_ARTIST },
         album: { ...DEFAULT_ALBUM },
         artworkUrl: '',
         duration: 0,
         streamUrl: '',
         filePath: '',
         isDownloaded: false,
         isLiked: false,
         youtubeId: '',
         spotifyId: '',
         addedAt: '',
         trackNumber: 0,
         playCount: 0,
      }
   }

   const t = raw as Record<string, unknown>

   // Normalize artist — handle string, object, or missing
   const artist = normalizeArtist(t.artist)

   // Normalize album — handle missing or malformed
   const albumRaw = t.album
   let album: Album
   if (albumRaw && typeof albumRaw === 'object') {
      album = normalizeAlbum(albumRaw)
      // Ensure album.artist is set (inherit from track artist if missing)
      if (!album.artist || album.artist.id === 'unknown') {
         album.artist = { ...artist }
      }
   } else {
      album = {
         ...DEFAULT_ALBUM,
         artist: { ...artist },
      }
   }

   // Parse duration — handle string, number, or missing
   let duration = 0
   if (typeof t.duration === 'number') {
      duration = t.duration
   } else if (typeof t.duration === 'string') {
      const parts = t.duration.split(':').map(Number)
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
         duration = parts[0] * 60 + parts[1]
      } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
         duration = parts[0] * 3600 + parts[1] * 60 + parts[2]
      }
   }

   return {
      id: String(t.id ?? t.videoId ?? t._id ?? `unknown-${Date.now()}`),
      title: String(t.title ?? 'Unknown Track'),
      artist,
      album,
      artworkUrl: String(t.artworkUrl ?? t.artwork ?? t.thumbnail ?? t.image ?? ''),
      duration,
      streamUrl: typeof t.streamUrl === 'string' ? t.streamUrl : '',
      filePath: typeof t.filePath === 'string' ? t.filePath : '',
      isDownloaded: Boolean(t.isDownloaded),
      isLiked: Boolean(t.isLiked),
      youtubeId: typeof t.youtubeId === 'string' ? t.youtubeId : '',
      spotifyId: typeof t.spotifyId === 'string' ? t.spotifyId : '',
      addedAt: typeof t.addedAt === 'string' ? t.addedAt : '',
      trackNumber: typeof t.trackNumber === 'number' ? t.trackNumber : 0,
      playCount: typeof t.playCount === 'number' ? t.playCount : 0,
   }
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
         description: '',
         artworkUrl: '',
         spotifyId: '',
         totalDuration: 0,
         createdAt: '',
         updatedAt: '',
      }
   }

   const p = raw as Record<string, unknown>

   // Tracks might be IDs (strings) or full Track objects
   let tracks: Track[] = []
   if (Array.isArray(p.tracks)) {
      tracks = p.tracks.map((t: unknown) => {
         if (typeof t === 'string') {
            return {
               id: t,
               title: 'Unknown Track',
               artist: { ...DEFAULT_ARTIST },
               album: { ...DEFAULT_ALBUM },
               artworkUrl: '',
               duration: 0,
               streamUrl: '',
               filePath: '',
               isDownloaded: false,
               isLiked: false,
               youtubeId: '',
               spotifyId: '',
               addedAt: '',
               trackNumber: 0,
               playCount: 0,
            }
         }
         return normalizeTrack(t)
      })
   }

   return {
      id: String(p.id ?? p._id ?? `unknown-${Date.now()}`),
      title: String(p.title ?? 'Untitled Playlist'),
      description: typeof p.description === 'string' ? p.description : '',
      artworkUrl: typeof p.artworkUrl === 'string' ? p.artworkUrl : '',
      tracks,
      trackCount: typeof p.trackCount === 'number' ? p.trackCount
         : typeof p.trackCount === 'string' ? parseInt(p.trackCount, 10) || 0
         : tracks.length,
      isLocal: Boolean(p.isLocal),
      spotifyId: typeof p.spotifyId === 'string' ? p.spotifyId : '',
      totalDuration: typeof p.totalDuration === 'number' ? p.totalDuration : 0,
      createdAt: String(p.createdAt ?? ''),
      updatedAt: String(p.updatedAt ?? ''),
   }
}

// ── Batch normalizers ──────────────────────────────────────────

/** Normalize an array of tracks, filtering out invalid records. */
export function normalizeTracks(raw: unknown[]): Track[] {
   if (!Array.isArray(raw)) return []
   return raw.map(normalizeTrack).filter(t => t.id && !t.id.startsWith('unknown-') || t.title !== 'Unknown Track')
}

/** Normalize an array of playlists. */
export function normalizePlaylists(raw: unknown[]): Playlist[] {
   if (!Array.isArray(raw)) return []
   return raw.map(normalizePlaylist)
}

/** Normalize a playlist search result (lighter than full Playlist). */
export function normalizePlaylistResult(raw: unknown): PlaylistResult {
   if (!raw || typeof raw !== 'object') {
      return { id: '', title: '', artworkUrl: '', trackCount: 0, source: 'youtube' }
   }
   const p = raw as Record<string, unknown>
   let trackCount = 0
   if (typeof p.trackCount === 'number') trackCount = p.trackCount
   else if (typeof p.trackCount === 'string') trackCount = parseInt(p.trackCount, 10) || 0
   return {
      id: String(p.id ?? ''),
      title: String(p.title ?? ''),
      artworkUrl: String(p.artworkUrl ?? ''),
      trackCount,
      source: String(p.source ?? 'youtube'),
   }
}

/** Normalize search results shape. */
export function normalizeSearchResults(raw: unknown): {
   tracks: Track[]
   albums: Album[]
   artists: Artist[]
   playlists: PlaylistResult[]
   query: string
} {
   if (!raw || typeof raw !== 'object') {
      return { tracks: [], albums: [], artists: [], playlists: [], query: '' }
   }

   const r = raw as Record<string, unknown>

   return {
      tracks: Array.isArray(r.tracks) ? r.tracks.map(normalizeTrack) : [],
      albums: Array.isArray(r.albums) ? r.albums.map(normalizeAlbum) : [],
      artists: Array.isArray(r.artists) ? r.artists.map(normalizeArtist) : [],
      playlists: Array.isArray(r.playlists) ? r.playlists.map(normalizePlaylistResult) : [],
      query: String(r.query ?? ''),
   }
}

// ── Utility: safe nested access ────────────────────────────────

/**
 * Safely access nested properties that might be undefined/null.
 * Use this in components as a last resort when normalizers can't cover the case.
 */
export function safeGet<T>(obj: unknown, path: string, fallback: T): T {
   try {
      const parts = path.split('.')
      let current: unknown = obj
      for (const part of parts) {
         if (current == null || typeof current !== 'object') return fallback
         current = (current as Record<string, unknown>)[part]
      }
      return (current ?? fallback) as T
   } catch {
      return fallback
   }
}
