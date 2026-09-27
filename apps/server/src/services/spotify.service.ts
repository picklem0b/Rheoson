import { badRequest } from '../errors.js';
import { engineJson } from './engine.service.js';

/**
 * The Spotify proxy — validation and translation only.
 *
 * Spotify metadata never passes through unvalidated: a share URL becomes a
 * query parameter (so it is length-bounded and encoded once), and batch
 * matching is sanitized row by row before anything reaches the engine,
 * which will put those strings next to a subprocess. Like the library, the
 * engine owns the matching and its cache; this layer owns the contract.
 */

export interface SpotifyTrack {
  id: string;
  videoId?: string;
  title: string;
  artist: { id: string; name: string };
  album: { id: string; title: string };
  duration?: number;
  artworkUrl?: string | null;
  source: string;
  isDownloaded: boolean;
  /** Set when the track exists in Spotify but has no YouTube match yet. */
  unmatched?: boolean;
  matchError?: string;
}

export type SpotifyResolve =
  | { kind: 'track'; track: SpotifyTrack }
  | {
      kind: 'album' | 'playlist' | 'artist';
      title: string;
      subtitle: string;
      artworkUrl?: string | null;
      tracks: SpotifyTrack[];
    };

const URL_MAX = 2048;
const MAX_BATCH = 50;
const MAX_ID_LEN = 40;

export async function resolveLink(userId: string, url: string): Promise<SpotifyResolve> {
  const trimmed = (url ?? '').trim();
  if (!trimmed) throw badRequest('RVA01', 'A Spotify link is required');
  if (trimmed.length > URL_MAX) throw badRequest('RVA02', 'That link is too long');

  return engineJson<SpotifyResolve>(`/spotify/resolve?url=${encodeURIComponent(trimmed)}`, {
    owner: userId,
    unavailable: 'RUP01',
    fallback: 'RUP01',
  });
}

interface RawTrackRow {
  spotifyId?: unknown;
  title?: unknown;
  artist?: unknown;
  durationMs?: unknown;
  artworkUrl?: unknown;
}

/** One cleaned row the engine can safely consume, or null for junk input. */
function cleanRow(row: unknown): { spotifyId: string; title: string; artist: string; durationMs: number | null; artworkUrl: string | null } | null {
  if (typeof row !== 'object' || row === null) return null;
  const raw = row as RawTrackRow;
  const spotifyId = typeof raw.spotifyId === 'string' ? raw.spotifyId.trim() : '';
  if (!spotifyId || spotifyId.length > MAX_ID_LEN) return null;
  return {
    spotifyId,
    title: typeof raw.title === 'string' ? raw.title.trim().slice(0, 200) : '',
    artist: typeof raw.artist === 'string' && raw.artist ? raw.artist.slice(0, 200) : 'Unknown Artist',
    durationMs: typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs) ? Math.round(raw.durationMs) : null,
    artworkUrl: typeof raw.artworkUrl === 'string' ? raw.artworkUrl : null,
  };
}

export async function matchBatch(userId: string, tracks: unknown): Promise<{ tracks: SpotifyTrack[] }> {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw badRequest('RVA03', 'A non-empty tracks list is required');
  }
  if (tracks.length > MAX_BATCH) {
    throw badRequest('RVA03', `At most ${MAX_BATCH} tracks per batch`);
  }
  const clean = tracks.map(cleanRow).filter((row): row is NonNullable<ReturnType<typeof cleanRow>> => row !== null);
  if (clean.length === 0) {
    throw badRequest('RVA03', 'No usable tracks in the batch');
  }
  return engineJson<{ tracks: SpotifyTrack[] }>('/spotify/match', {
    method: 'POST',
    body: { tracks: clean },
    owner: userId,
    unavailable: 'RUP01',
    fallback: 'RUP01',
  });
}
