/**
 * Signal reporter — sends behavioral signals to the recommendation engine.
 *
 * Every meaningful interaction (play, skip, like, search) is reported
 * to the backend where it feeds the taste profiler and recommendation engine.
 */

import { api } from '@/api/client.api';

type SignalType =
  | 'play_start'
  | 'play_complete'
  | 'play_progress'
  | 'skip'
  | 'repeat'
  | 'like'
  | 'unlike'
  | 'add_to_playlist'
  | 'remove_playlist'
  | 'search'
  | 'queue_add'
  | 'download';

interface SignalPayload {
  signal: SignalType;
  track_id?: string;
  artist?: string;
  progress?: number;
  session_id?: string;
  context?: Record<string, unknown>;
}

let _sessionId = crypto.randomUUID();

/**
 * Report a behavioral signal to the backend.
 * Fire-and-forget — errors are silently swallowed.
 */
export function reportSignal(payload: SignalPayload): void {
  // api client already prefixes API_BASE (which ends in /api) — the
  // route here must NOT include the /api segment or it doubles up.
  api.post('/tracks/signals', {
    ...payload,
    session_id: _sessionId,
  }).catch(() => {}); // Best-effort
}

/** Convenience wrappers for common signals */

export function signalPlayStart(trackId?: string, artist?: string) {
  reportSignal({ signal: 'play_start', track_id: trackId, artist });
}

export function signalPlayComplete(trackId?: string, artist?: string) {
  reportSignal({ signal: 'play_complete', track_id: trackId, artist });
}

export function signalSkip(trackId: string | undefined, progress: number, artist?: string) {
  reportSignal({ signal: 'skip', track_id: trackId, progress, artist });
}

export function signalProgress(trackId: string | undefined, progress: number) {
  reportSignal({ signal: 'play_progress', track_id: trackId, progress });
}

export function signalRepeat(trackId?: string, artist?: string) {
  reportSignal({ signal: 'repeat', track_id: trackId, artist });
}

export function signalLike(trackId?: string, artist?: string) {
  reportSignal({ signal: 'like', track_id: trackId, artist });
}

export function signalUnlike(trackId?: string) {
  reportSignal({ signal: 'unlike', track_id: trackId });
}

export function signalSearch(query: string) {
  reportSignal({ signal: 'search', context: { query } });
}

export function signalQueueAdd(trackId?: string, artist?: string) {
  reportSignal({ signal: 'queue_add', track_id: trackId, artist });
}

export function signalDownload(trackId?: string, artist?: string) {
  reportSignal({ signal: 'download', track_id: trackId, artist });
}

/** Reset session (e.g. on app restart) */
export function resetSession() {
  _sessionId = crypto.randomUUID();
}
