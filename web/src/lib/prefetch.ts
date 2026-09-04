/**
 * Stream warm-up — makes pressing play start audio in under a second.
 *
 * How it works: the moment a track is selected (or shows up in the
 * next-up queue), we POST to the backend's warm endpoint. The backend
 * spawns yt-dlp in the background and starts buffering the audio to
 * disk. When the player then requests the stream, the backend serves
 * it straight from that buffer file — no waiting for yt-dlp extraction
 * on the play request itself.
 *
 * Previously this fired a HEAD request, but the backend answered HEAD
 * instantly without warming anything, so the first play still paid the
 * full yt-dlp startup cost.
 *
 * Warm-up is skipped when offline — there's nothing to warm.
 */

import { API_BASE } from './constants';
import { isOnline } from './network';

const _inflight = new Map<string, AbortController>();

/**
 * Warm a single track's stream.  Safe to call multiple times for the
 * same track — only one request runs at a time.
 * No-ops when offline.
 */
export function prefetchStream(trackId: string): void {
  if (!isOnline()) return;
  if (_inflight.has(trackId)) return;
  const controller = new AbortController();
  _inflight.set(trackId, controller);

  fetch(`${API_BASE}/stream/${trackId}/warm`, {
    method: 'POST',
    signal: controller.signal,
    // Include credentials so the backend can attribute the request
    credentials: 'include',
  }).catch(() => {
    // Warming is best-effort — a failure just means the first play
    // falls back to the normal live-stream path.
  }).finally(() => {
    _inflight.delete(trackId);
  });
}

/**
 * Warm the first N tracks from a search result list.
 * Fires-and-forgets; errors are intentionally swallowed.
 */
export function prefetchSearchResults(trackIds: string[], limit = 5): void {
  trackIds.slice(0, limit).forEach((id) => prefetchStream(id));
}

/**
 * Warm upcoming queue tracks so skip / auto-advance starts instantly.
 */
export function prefetchQueue(trackIds: string[], limit = 3): void {
  trackIds.slice(0, limit).forEach((id) => prefetchStream(id));
}

/**
 * Cancel all in-flight warm-ups (e.g. on unmount).
 */
export function cancelPrefetches(): void {
  _inflight.forEach((c) => c.abort());
  _inflight.clear();
}
