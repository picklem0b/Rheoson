import { ERRORS, fail } from '@rheoson/shared'
import type { Provider, StreamTicket, TrackSummary } from '@rheoson/shared'
import type { Bindings } from '../env'
import { providerById, providerHealth, searchProviders } from '../providers/registry'

/**
 * The catalogue: what to ask, and for how long to remember the answer.
 *
 * A search is one concurrent call per configured provider, cached briefly per
 * isolate, so typing the same word twice is free and a dead provider is one
 * failure rather than one per keystroke. Nothing here touches the database; a
 * search that needs the catalogue stored comes later, and it will store what
 * this returns.
 */

const SEARCH_TTL_MS = 60_000
const TRENDING_TTL_MS = 10 * 60_000
const CACHE_LIMIT = 100

const searchCache = new Map<string, { at: number; items: TrackSummary[] }>()

let trendingCache: { at: number; items: TrackSummary[]; provider: Provider | null; limit: number } | null = null

/** Sweep expired rows before the map is allowed to grow past its cap. */
function rememberSearch(key: string, items: TrackSummary[]): void {
  searchCache.set(key, { at: Date.now(), items })

  if (searchCache.size <= CACHE_LIMIT) return
  for (const [cachedKey, entry] of searchCache) {
    if (Date.now() - entry.at >= SEARCH_TTL_MS) searchCache.delete(cachedKey)
  }
}

export async function searchTracks(
  env: Bindings,
  query: { q: string; limit: number },
  signal?: AbortSignal,
): Promise<TrackSummary[]> {
  const key = `${query.q.toLowerCase()}:${query.limit}`
  const hit = searchCache.get(key)
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.items

  const { items } = await searchProviders(env, { query: query.q, limit: query.limit, signal })

  rememberSearch(key, items)
  return items
}

/**
 * The chart, from the first provider that publishes one.
 *
 * Audius and Jamendo are asked in order and each has a weekly window, so the
 * list is the same for every caller until the cache turns over — which is what
 * makes it cheap enough to be the first thing Home asks for.
 */
export async function trendingTracks(
  env: Bindings,
  limit: number,
  signal?: AbortSignal,
): Promise<{ items: TrackSummary[]; provider: Provider | null }> {
  if (trendingCache && trendingCache.limit >= limit && Date.now() - trendingCache.at < TRENDING_TTL_MS) {
    return { items: trendingCache.items.slice(0, limit), provider: trendingCache.provider }
  }

  for (const provider of providerHealth(env)) {
    if (!provider.configured) continue

    const adapter = providerById(env, provider.id)
    if (!adapter.trending) continue

    try {
      const items = await adapter.trending(limit, signal)
      if (items.length === 0) continue

      trendingCache = { at: Date.now(), items, provider: provider.id, limit }
      return { items, provider: provider.id }
    } catch {
      // A chart is a nicer first screen, never a requirement: try the next one.
    }
  }

  trendingCache = { at: Date.now(), items: [], provider: null, limit }
  return { items: [], provider: null }
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
  if (!providerTrackId.trim()) throw fail(ERRORS.CORE.INVALID_REQUEST)

  return providerById(env, provider).streamUrl(providerTrackId, signal)
}

export async function resolveTrack(
  env: Bindings,
  provider: Provider,
  providerTrackId: string,
  signal?: AbortSignal,
): Promise<TrackSummary> {
  return providerById(env, provider).resolveTrack(providerTrackId, signal)
}

/** What /health reports about the catalogue: one working provider is enough. */
export function catalogueStatus(env: Bindings): 'configured' | 'partial' | 'unconfigured' {
  const providers = providerHealth(env)
  const configured = providers.filter((provider) => provider.configured).length

  if (configured === 0) return 'unconfigured'
  if (configured < providers.length) return 'partial'
  return 'configured'
}
