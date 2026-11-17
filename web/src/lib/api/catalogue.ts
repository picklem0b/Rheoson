import { searchResultsSchema, streamTicketSchema } from '@rheoson/shared'
import type { Provider } from '@rheoson/shared'
import { apiGet } from './httpClient'

/**
 * The catalogue, from the browser side.
 *
 * Search is a GET whose contract the client parses. Playback is two steps on
 * purpose: the ticket is asked for when someone presses play, and it is never
 * kept anywhere that outlives the song.
 */

export function searchTracks(query: string, signal?: AbortSignal) {
  return apiGet('/search', { schema: searchResultsSchema, query: { q: query }, signal })
}

export function resolveStream(provider: Provider, providerTrackId: string, signal?: AbortSignal) {
  return apiGet(
    `/streams/${encodeURIComponent(provider)}/${encodeURIComponent(providerTrackId)}`,
    { schema: streamTicketSchema, signal },
  )
}
