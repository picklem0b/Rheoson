'use client';

/**
 * The API client — one place that knows how to fail.
 *
 * Two rules run through this file:
 *
 * 1. **Every failure carries a DCCNN code.** The server sends
 *    `{ error, code, detail }`; this turns it into an `ApiError` whose `code`
 *    the toast shows and whose `detail` the ⓘ button reveals. A failure with
 *    no code is a bug, and it is labelled as one rather than shown as copy.
 * 2. **The status decides the surface.** 401/403/404/429 and 5xx are *page*
 *    states; anything else is a toast. That mapping lives here so a component
 *    never has to decide how loud an error should be.
 */

import { ERROR_MESSAGES } from '@rheoson/shared';
import { session } from './session';

export interface ApiErrorBody {
  error?: string;
  code?: string | null;
  detail?: string | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly detail: string | null;

  constructor(status: number, body: ApiErrorBody) {
    const code = body.code ?? null;
    const message = body.error ?? (code ? ERROR_MESSAGES[code] : undefined) ?? 'Something went wrong';
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = body.detail ?? null;
  }

  /** What the ⓘ panel shows: the code, the copy, and the server's detail. */
  get explanation(): string {
    const parts = [this.code ? `[ERROR_CODE: ${this.code}]` : null, this.detail].filter(Boolean);
    return parts.length > 0 ? parts.join(' — ') : this.message;
  }
}

/** The statuses that are page states rather than toasts. */
const PAGE_STATUSES = new Set([401, 403, 404, 429]);

export function isPageStatus(status: number): boolean {
  return PAGE_STATUSES.has(status) || status >= 500;
}

type PageHandler = (error: ApiError) => void;

let pageHandler: PageHandler | null = null;

/**
 * Register how a page-level failure is shown (a redirect to `/error/:status`).
 * Registered once by the app provider; a missing handler means the caller
 * still gets the thrown error, so nothing is silently swallowed.
 */
export function onPageError(handler: PageHandler | null): void {
  pageHandler = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip the page-level handler: used by surfaces that render the failure. */
  quiet?: boolean;
  signal?: AbortSignal;
}

/** Base URL of the API. The browser always talks to one origin: the API's. */
export function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  // Same-origin by default, so a reverse proxy deployment needs no config.
  return '';
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    // A non-JSON body is a crash, not a crafted error: the status still tells
    // the truth and the fallback copy is the honest one.
  }
  return new ApiError(res.status, body);
}

/**
 * The one request function.
 *
 * Anything that is not a 2xx throws — callers never branch on `res.ok`, which
 * is how "the request failed but we rendered the empty state anyway" happens.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await session().getToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...session().headers(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
  };

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: 'include',
    });
  } catch (cause) {
    // A network failure has no code from the server, so it gets the offline
    // code: "503, we'll be back shortly" is closer to the truth than a toast
    // that says nothing at all.
    const error = new ApiError(503, { code: 'SUP02', error: ERROR_MESSAGES.SUP02 });
    if (!options.quiet && pageHandler) pageHandler(error);
    throw error;
  }

  if (!res.ok) {
    const error = await parseError(res);
    if (!options.quiet && isPageStatus(error.status) && pageHandler) pageHandler(error);
    throw error;
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ── Response shapes (the shared contract, client side) ────────
// These mirror `packages/shared` plus the server-only fields the views need.

export interface Track {
  id: string;
  title: string;
  artist: { id: string; name: string };
  album: { id: string; title: string };
  duration?: number;
  videoId?: string;
  isDownloaded: boolean;
  isLiked: boolean;
  artworkUrl: string;
  year?: number;
}

export interface DownloadJob {
  id: string;
  owner: string;
  target: string;
  trackId: string | null;
  url: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  speed: number | null;
  eta: number | null;
  totalBytes: number | null;
  downloadedBytes: number;
  title: string;
  artist: string;
  filename: string;
  error: string | null;
  errorCode: string | null;
  attempts: number;
  resumable: boolean;
  stagedBytes: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Playlist {
  id: string;
  title: string;
  trackIds: string[];
  trackCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LyricsLine {
  startTime: number;
  text: string;
}

export interface Lyrics {
  plain: string;
  synced: string;
  title: string;
  artist: string;
  album: string;
  duration: number | null;
  source: string;
  lines: LyricsLine[];
}

export interface Profile {
  id: string;
  username: string;
  imageUrl: string | null;
  email: string | null;
  createdAt: string;
}

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

// ── Endpoints ─────────────────────────────────────────────────

export const api = {
  me: () => request<Profile>('/api/me'),

  preferences: () => request<Record<string, unknown>>('/api/me/preferences'),
  savePreferences: (patch: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api/me/preferences', { method: 'PUT', body: patch }),
  preferenceDefaults: () => request<Record<string, unknown>>('/api/me/preferences/defaults'),

  likes: (limit = 500) => request<{ trackIds: string[]; total: number }>(`/api/me/likes?limit=${limit}`),
  likedCount: () => request<{ count: number }>('/api/me/likes/count'),
  like: (trackId: string) => request<{ liked: boolean }>('/api/me/likes', { method: 'POST', body: { trackId } }),
  unlike: (trackId: string) =>
    request<{ liked: boolean }>(`/api/me/likes/${encodeURIComponent(trackId)}`, { method: 'DELETE' }),

  history: (limit = 50) => request<{ items: Array<{ trackId: string; playedAt: string }> }>(`/api/me/history?limit=${limit}`),
  topTracks: () => request<{ items: Array<{ trackId: string; plays: number }> }>('/api/me/history/top'),
  recordPlay: (trackId: string, secondsPlayed?: number) =>
    request<{ recorded: boolean }>('/api/me/history', { method: 'POST', body: { trackId, secondsPlayed } }),
  clearHistory: () => request<{ removed: number }>('/api/me/history', { method: 'DELETE' }),

  follows: () => request<{ artistIds: string[] }>('/api/me/follows'),
  follow: (artistId: string) => request<{ following: boolean }>('/api/me/follows', { method: 'POST', body: { artistId } }),
  unfollow: (artistId: string) =>
    request<{ following: boolean }>(`/api/me/follows/${encodeURIComponent(artistId)}`, { method: 'DELETE' }),

  /** One track by id: playlists, history rows and deep links only hold an id. */
  track: (trackId: string) => request<Track>(`/api/tracks/${encodeURIComponent(trackId)}`, { quiet: true }),

  libraryTracks: (limit = 200, offset = 0) =>
    request<{ tracks: Track[]; total: number }>(`/api/library/tracks?limit=${limit}&offset=${offset}`),
  libraryArtists: () =>
    request<{ artists: Array<{ id: string; name: string; trackCount: number; albumCount: number }> }>('/api/library/artists'),
  libraryAlbums: () =>
    request<{ albums: Array<{ id: string; title: string; artist: { id: string; name: string }; trackCount: number }> }>(
      '/api/library/albums',
    ),
  /** One artist's tracks — the artist page's drill-down. */
  artistTracks: (name: string) =>
    request<{ artist: { id: string; name: string }; tracks: Track[] }>(
      `/api/library/artists/${encodeURIComponent(name)}`,
      { quiet: true },
    ),
  /** One album's tracks; the id is the engine's `artist\u0000title` key. */
  albumTracks: (albumId: string) =>
    request<{ album: { id: string; title: string; artist: { id: string; name: string } }; tracks: Track[] }>(
      `/api/library/albums/${encodeURIComponent(albumId)}`,
      { quiet: true },
    ),

  search: (query: string, remote = true) =>
    request<{ query: string; tracks: Track[]; localCount: number; remoteCount: number; remoteAvailable: boolean }>(
      `/api/search?q=${encodeURIComponent(query)}&remote=${remote ? 'true' : 'false'}`,
      { quiet: true },
    ),

  /** A Spotify share link → matched, playable tracks. Quiet: the search
   * page renders the failure with its code, not an error page. */
  spotifyResolve: (url: string) =>
    request<SpotifyResolve>(`/api/spotify/resolve?url=${encodeURIComponent(url)}`, { quiet: true }),
  /** Batch YouTube matching for Spotify rows kept unmatched earlier. */
  spotifyMatch: (tracks: Array<{ spotifyId: string; title: string; artist: string; durationMs?: number | null; artworkUrl?: string | null }>) =>
    request<{ tracks: SpotifyTrack[] }>('/api/spotify/match', { method: 'POST', body: { tracks }, quiet: true }),

  lyrics: (title: string, artist: string, duration?: number) => {
    const params = new URLSearchParams({ title, artist });
    if (duration && duration > 0) params.set('duration', String(Math.round(duration)));
    // A track with no lyrics is a normal answer, not a failure to shout about.
    return request<Lyrics>(`/api/lyrics?${params.toString()}`, { quiet: true });
  },

  playlists: () => request<{ playlists: Playlist[] }>('/api/playlists'),
  playlist: (id: string) => request<Playlist>(`/api/playlists/${encodeURIComponent(id)}`),
  createPlaylist: (name: string, description?: string) =>
    request<Playlist>('/api/playlists', { method: 'POST', body: { name, description } }),
  renamePlaylist: (id: string, name: string) =>
    request<Playlist>(`/api/playlists/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } }),
  deletePlaylist: (id: string) => request<{ deleted: boolean }>(`/api/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  addToPlaylist: (id: string, trackId: string) =>
    request<Playlist>(`/api/playlists/${encodeURIComponent(id)}/tracks`, { method: 'POST', body: { trackId } }),
  removeFromPlaylist: (id: string, trackId: string) =>
    request<Playlist>(`/api/playlists/${encodeURIComponent(id)}/tracks/${encodeURIComponent(trackId)}`, {
      method: 'DELETE',
    }),
  reorderPlaylist: (id: string, trackIds: string[]) =>
    request<Playlist>(`/api/playlists/${encodeURIComponent(id)}/reorder`, { method: 'PUT', body: { trackIds } }),

  downloads: () => request<{ jobs: DownloadJob[] }>('/api/downloads'),
  /** A job names either a track id or a URL; the server refuses a request with
   * neither, so the type does too. */
  download: (input: { trackId?: string; url?: string; title?: string }) =>
    request<DownloadJob>('/api/downloads', { method: 'POST', body: input, quiet: true }),
  downloadId: (jobId: string) => request<DownloadJob>(`/api/downloads/${encodeURIComponent(jobId)}`, { quiet: true }),
  cancelDownload: (jobId: string) =>
    request<DownloadJob>(`/api/downloads/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }),
  retryDownload: (jobId: string, resume?: boolean) =>
    request<DownloadJob>(`/api/downloads/${encodeURIComponent(jobId)}/retry`, { method: 'POST', body: { resume } }),

  /** One URL for a track's bytes — a plain URL, used by the audio element. */
  streamUrlRaw: (trackId: string) => `/api/tracks/${encodeURIComponent(trackId)}/stream`,

  deleteDownload: (jobId: string) =>
    request<{ id: string; deleted: boolean; stagingKept: boolean }>(`/api/downloads/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
    }),

  trackInfo: (trackId: string) =>
    request<{ mime: string; bytes: number | null; relayAvailable: boolean; probed: boolean }>(
      `/api/tracks/${encodeURIComponent(trackId)}/info`,
      { quiet: true },
    ),

  /** The byte URL for a track. Range handling is the browser's job. */
  streamUrl: (trackId: string) => `${apiBase()}/api/tracks/${encodeURIComponent(trackId)}/stream`,
  artworkUrl: (trackId: string) => `${apiBase()}/api/tracks/${encodeURIComponent(trackId)}/artwork`,
};
