/**
 * Stream URL prefetcher — warms the backend cache so pressing play
 * starts audio instantly.
 *
 * Rheoson's secret: when a user selects a track, the browser sends
 * a HEAD request to the stream endpoint before the player needs it.
 * The backend resolves the YouTube URL once, caches it, and the
 * subsequent GET from the player is a direct hit.
 *
 * Prefetching is skipped when offline — there's nothing to warm.
 */

import { API_BASE } from './constants';
import { isOnline } from './network';

const _inflight = new Map<string, AbortController>();

/**
 * Prefetch a single track's stream URL.  Safe to call multiple times
 * for the same track — only one request runs at a time.
 * No-ops when offline.
 */
export function prefetchStream(trackId: string): void {
  if (!isOnline()) return;
  if (_inflight.has(trackId)) return;
  const controller = new AbortController();
  _inflight.set(trackId, controller);

  fetch(`${API_BASE}/stream/${trackId}/audio`, {
    method: 'HEAD',
    signal: controller.signal,
    // Include credentials so the backend can attribute the request
    credentials: 'include',
  }).finally(() => {
    _inflight.delete(trackId);
  });
}

/**
 * Prefetch the first N tracks from a search result list.
 * Fires-and-forgets; errors are intentionally swallowed.
 */
export function prefetchSearchResults(trackIds: string[], limit = 5): void {
  trackIds.slice(0, limit).forEach((id) => prefetchStream(id));
}

/**
 * Prefetch upcoming queue tracks.
 */
export function prefetchQueue(trackIds: string[], limit = 3): void {
  trackIds.slice(0, limit).forEach((id) => prefetchStream(id));
}

/**
 * Cancel all in-flight prefetches (e.g. on unmount).
 */
export function cancelPrefetches(): void {
  _inflight.forEach((c) => c.abort());
  _inflight.clear();
}
