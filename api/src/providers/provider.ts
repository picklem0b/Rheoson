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

export interface MusicProvider {
  readonly id: Provider
  search(options: SearchOptions): Promise<TrackSummary[]>
  resolveTrack(providerTrackId: string, signal?: AbortSignal): Promise<TrackSummary>
  /** A signed, short-lived URL. Callers hand it to an audio element and drop it. */
  streamUrl(providerTrackId: string, signal?: AbortSignal): Promise<StreamTicket>
}
