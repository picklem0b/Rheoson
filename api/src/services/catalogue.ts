import { ERRORS, fail } from '@rheoson/shared'
import type { Provider, StreamTicket, TrackSummary } from '@rheoson/shared'
import type { Bindings } from '../env'
import { createAudiusProvider } from '../providers/audius'
import type { MusicProvider } from '../providers/provider'

/**
 * The catalogue: what to ask, and for how long to remember the answer.
 *
 * A search is one upstream call per page and is cached briefly per isolate, so
 * typing the same word twice is free and a dead provider is one failure rather
 * than one per keystroke. Nothing here touches the database; a search that needs
 * the catalogue stored comes later, and it will store what this returns.
 */

const CACHE_TTL_MS = 60_000
const CACHE_LIMIT = 100

const cache = new Map<string, { at: number; items: TrackSummary[] }>()

function providerFor(env: Bindings, provider: Provider): MusicProvider {
  if (provider === 'audius') return createAudiusProvider(env.AUDIUS_APP_NAME ?? 'Rheoson')
  throw fail(ERRORS.PROVIDER.UNSUPPORTED)
}

function remember(key: string, items: TrackSummary[]): void {
  cache.set(key, { at: Date.now(), items })

  if (cache.size <= CACHE_LIMIT) return
  for (const [cachedKey, entry] of cache) {
    if (Date.now() - entry.at >= CACHE_TTL_MS) cache.delete(cachedKey)
  }
}

export async function searchTracks(
  env: Bindings,
  query: { q: string; limit: number },
  signal?: AbortSignal,
): Promise<TrackSummary[]> {
  const key = `${query.q.toLowerCase()}:${query.limit}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items

  const items = await providerFor(env, 'audius').search({
    query: query.q,
    limit: query.limit,
    signal,
  })

  remember(key, items)
  return items
}

/**
 * Resolve a playable URL.
 *
 * The ticket is returned to the caller and forgotten. Storing it would mean
 * storing a URL that is dead in minutes.
 */
export async function resolveStream(
  env: Bindings,
  provider: Provider,
  providerTrackId: string,
  signal?: AbortSignal,
): Promise<StreamTicket> {
  return providerFor(env, provider).streamUrl(providerTrackId, signal)
}
