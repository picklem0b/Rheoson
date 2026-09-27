import { ApiError, notFound } from '../errors.js';
import { engineJson, engineStream } from './engine.service.js';
import { likedSet } from './account.service.js';

/**
 * The library view: engine facts + per-user flags.
 *
 * The split is deliberate and mirrors the data-ownership boundary the whole
 * migration is built on:
 *
 * * **What is on disk** is the engine's answer — it owns the files, the tags
 *   and the identity map.
 * * **What this person thinks of it** is the server's answer — likes come from
 *   Postgres, keyed by the same track id.
 *
 * Merging happens here, once, so no route and no component ever has to join
 * those two worlds itself.
 */

export interface TrackView {
  id: string;
  title: string;
  artist: { id: string; name: string };
  album: { id: string; title: string };
  duration?: number;
  videoId?: string;
  isDownloaded: boolean;
  isLiked: boolean;
  artworkUrl: string;
  fileId?: string;
  year?: number;
}

interface EngineTrack {
  id: string;
  title: string;
  artist: { id: string; name: string };
  album: { id: string; title: string };
  duration?: number;
  videoId?: string;
  fileId?: string;
  isDownloaded?: boolean;
  year?: number;
}

/**
 * Tag every track with this user's like state and the artwork route.
 *
 * `artworkUrl` is built here rather than returned by the engine because the
 * browser must only ever be given a URL on the API's own origin: the client
 * names a track, and the server decides how to fetch the bytes.
 */
export async function decorate(userId: string, tracks: EngineTrack[]): Promise<TrackView[]> {
  if (tracks.length === 0) return [];
  const liked = await likedSet(
    userId,
    tracks.map((track) => track.id),
  );

  return tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    videoId: track.videoId,
    fileId: track.fileId,
    year: track.year,
    isDownloaded: Boolean(track.isDownloaded),
    isLiked: liked.has(track.id),
    artworkUrl: `/api/tracks/${encodeURIComponent(track.id)}/artwork`,
  }));
}

export async function listLibraryTracks(
  userId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<{ tracks: TrackView[]; total: number }> {
  const limit = Math.max(1, Math.min(options.limit ?? 200, 500));
  const offset = Math.max(0, options.offset ?? 0);
  const body = await engineJson<{ tracks: EngineTrack[]; total: number }>(
    `/library/tracks?limit=${limit}&offset=${offset}`,
    { owner: userId, unavailable: 'SUP02', fallback: 'LEN01' },
  );
  return { tracks: await decorate(userId, body.tracks ?? []), total: body.total ?? 0 };
}

/**
 * One track, for the surfaces that only hold an id: a playlist, a history row,
 * a deep link. Without this the client would have to fetch the whole library
 * and filter it, which is both slower and *wrong* — the library list is
 * paginated, so a track past the page would look deleted.
 */
export async function getTrack(userId: string, trackId: string): Promise<TrackView> {
  const body = await engineJson<{ track: EngineTrack }>(
    `/library/tracks/${encodeURIComponent(trackId)}`,
    // A missing track is the engine's 404 translated to the registry's
    // "Track not found" — not an outage, and not a 500.
    { owner: userId, unavailable: 'SUP02', fallback: 'TNF01' },
  );

  const [view] = await decorate(userId, body.track ? [body.track] : []);
  if (!view) throw notFound('TNF01');
  return view;
}

export async function listArtists(userId: string): Promise<Array<{ id: string; name: string; trackCount: number; albumCount: number }>> {
  const body = await engineJson<{ artists: Array<{ id: string; name: string; trackCount: number; albumCount: number }> }>(
    '/library/artists',
    { owner: userId, unavailable: 'SUP02', fallback: 'LEN01' },
  );
  return body.artists ?? [];
}

export async function listAlbums(userId: string) {
  const body = await engineJson<{ albums: Array<{ id: string; title: string; artist: { id: string; name: string }; trackCount: number }> }>(
    '/library/albums',
    { owner: userId, unavailable: 'SUP02', fallback: 'LEN01' },
  );
  return body.albums ?? [];
}

/** Cover art for one track, relayed without being parsed. */
export async function artwork(userId: string, trackId: string): Promise<Response> {
  return engineStream(`/artwork/${encodeURIComponent(trackId)}`, {
    owner: userId,
    unavailable: 'SUP02',
    // No local file and no embedded art is a normal outcome, not an outage.
    timeoutMs: 10_000,
  });
}

/**
 * The lyrics lookup, forwarded with the engine's own copy on failure. A track
 * with no lyrics is `RNF01` — an answer the Now Playing sheet renders as empty
 * space, never an error the user has to dismiss.
 */
export async function lyrics(title: string, artist: string, album?: string, duration?: number) {
  const params = new URLSearchParams({ title, artist: artist ?? '' });
  if (album) params.set('album', album);
  if (duration && duration > 0) params.set('duration', String(Math.round(duration)));

  return engineJson<{
    plain: string;
    synced: string;
    title: string;
    artist: string;
    album: string;
    duration: number | null;
    source: string;
    lines: Array<{ startTime: number; text: string }>;
  }>(`/lyrics?${params.toString()}`, { unavailable: 'RUP01', fallback: 'RNF01' });
}

/** Guard so a route can name the failure precisely when the engine is down. */
export function engineDown(): ApiError {
  return new ApiError('SUP02', 503, 'The library engine is unreachable');
}
