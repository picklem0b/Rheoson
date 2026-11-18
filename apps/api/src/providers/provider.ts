import type { Provider, StreamTicket, TrackSummary } from '@rheoson/shared'

/**
 * What a music provider has to answer.
 *
 * The interface is deliberately three calls wide. A second provider is a file
 * that implements it, never a refactor of the service or the screen, and every
 * provider-specific field stays inside its own adapter.
 */

export interface SearchOptions {
  query: string
  limit: number
  signal?: AbortSignal
}

/**
 * `full` streams the whole recording; `preview` streams a legal excerpt
 * (Deezer, iTunes). The catalogue prefers full tracks when both answer, and the
 * UI is allowed to tell the listener which one it got.
 */
export type StreamKind = 'full' | 'preview'

export interface MusicProvider {
  readonly id: Provider
  readonly label: string
  readonly stream: StreamKind
  /** False when the adapter needs a key this deployment does not have. */
  readonly configured: boolean
  search(options: SearchOptions): Promise<TrackSummary[]>
  resolveTrack(providerTrackId: string, signal?: AbortSignal): Promise<TrackSummary>
  /** A signed, short-lived URL. Callers hand it to an audio element and drop it. */
  streamUrl(providerTrackId: string, signal?: AbortSignal): Promise<StreamTicket>
  /** Optional because not every provider publishes a chart. */
  trending?(limit: number, signal?: AbortSignal): Promise<TrackSummary[]>
}
