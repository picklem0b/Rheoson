import { badRequest } from '../errors.js';
import { decorate, type TrackView } from './library.service.js';
import { engineJson } from './engine.service.js';

/**
 * Search — one query, answered from the library and from YouTube.
 *
 * The engine does the looking (it has the files and it has `yt-dlp`); the
 * server adds the part only it knows: which results this user has already
 * liked. Meilisearch, when configured, replaces the *library* half only —
 * remote search is extraction, not indexing, and an index cannot answer it.
 */

const MAX_QUERY_LEN = 200;

export interface SearchResult {
  query: string;
  tracks: TrackView[];
  localCount: number;
  remoteCount: number;
  remoteAvailable: boolean;
}

export function cleanQuery(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // Control characters are stripped so a query can never carry a newline into
  // a log line or a subprocess argument's neighbourhood.
  const printable = raw.replace(/[\u0000-\u001f\u007f]/g, '');
  return printable.trim().slice(0, MAX_QUERY_LEN);
}

export async function search(
  userId: string,
  rawQuery: unknown,
  options: { remote?: boolean; limit?: number } = {},
): Promise<SearchResult> {
  const query = cleanQuery(rawQuery);
  if (!query) throw badRequest('RVA04');

  const remote = options.remote !== false;
  const limit = Math.max(1, Math.min(options.limit ?? 20, 50));

  const body = await engineJson<{
    query: string;
    tracks: Array<Record<string, unknown>>;
    local: Array<Record<string, unknown>>;
    remote: Array<Record<string, unknown>>;
    remoteAvailable: boolean;
  }>(`/search?q=${encodeURIComponent(query)}&remote=${remote ? 'true' : 'false'}&limit=${limit}`, {
    owner: userId,
    // A search the engine cannot answer degrades to "no results"; it is not a
    // 5xx the user has to act on.
    unavailable: 'RUP01',
    fallback: 'RUP01',
  });

  const tracks = await decorate(userId, (body.tracks ?? []) as never);

  return {
    query: body.query ?? query,
    tracks,
    localCount: (body.local ?? []).length,
    remoteCount: (body.remote ?? []).length,
    remoteAvailable: Boolean(body.remoteAvailable),
  };
}
