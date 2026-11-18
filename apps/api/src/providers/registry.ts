import { ERRORS, fail } from '@rheoson/shared'
import type { Provider, TrackSummary } from '@rheoson/shared'
import type { Bindings } from '../env'
import { createAudiusProvider } from './audius'
import { createDeezerProvider } from './deezer'
import { createItunesProvider } from './itunes'
import { createJamendoProvider } from './jamendo'
import type { MusicProvider, StreamKind } from './provider'
import { createSoundcloudProvider } from './soundcloud'

/**
 * Every provider, in the order the catalogue trusts them.
 *
 * A full stream comes before a preview, and a provider that needs no key before
 * one that does, so the first result page is playable on a fresh checkout. Order
 * is a preference, never a dependency: the registry drops what is unconfigured
 * and keeps going when one provider is down.
 */

export interface ProviderHealth {
  id: Provider
  label: string
  stream: StreamKind
  configured: boolean
}

export function allProviders(env: Bindings): MusicProvider[] {
  return [
    createAudiusProvider(env.AUDIUS_APP_NAME ?? 'Rheoson'),
    createJamendoProvider(env.JAMENDO_CLIENT_ID),
    createSoundcloudProvider(env.SOUNDCLOUD_CLIENT_ID),
    createDeezerProvider(),
    createItunesProvider(),
  ]
}

export function activeProviders(env: Bindings): MusicProvider[] {
  return allProviders(env).filter((provider) => provider.configured)
}

export function providerHealth(env: Bindings): ProviderHealth[] {
  return allProviders(env).map(({ id, label, stream, configured }) => ({ id, label, stream, configured }))
}

export function providerById(env: Bindings, id: Provider): MusicProvider {
  const provider = allProviders(env).find((candidate) => candidate.id === id)

  if (!provider || !provider.configured) throw fail(ERRORS.PROVIDER.UNSUPPORTED)
  return provider
}

export interface ProviderSearch {
  query: string
  limit: number
  signal?: AbortSignal
  /** Ask one provider only, for a stream or track that names it. */
  provider?: Provider
}

export interface AggregatedSearch {
  items: TrackSummary[]
  answered: Provider[]
}

/** Case and punctuation are noise when the same recording arrives twice. */
function identity(track: TrackSummary): string {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return `${normalize(track.title)}|${normalize(track.artistName)}`
}

/**
 * Ask every configured provider, then interleave.
 *
 * Concatenating instead would make the result order depend on which provider
 * answered first, so one catalogue would own the whole page. Interleaving keeps
 * every provider visible and, because a dead one settles as a rejection rather
 * than a throw, a broken provider costs its own results and nothing else.
 */
export async function searchProviders(env: Bindings, options: ProviderSearch): Promise<AggregatedSearch> {
  const providers = options.provider
    ? [providerById(env, options.provider)]
    : activeProviders(env)

  if (providers.length === 0) throw fail(ERRORS.PROVIDER.UNAVAILABLE)

  const settled = await Promise.allSettled(
    providers.map((provider) =>
      provider.search({ query: options.query, limit: options.limit, signal: options.signal }),
    ),
  )

  const answered: Provider[] = []
  const groups: TrackSummary[][] = []

  settled.forEach((result, index) => {
    const provider = providers[index]
    if (!provider || result.status !== 'fulfilled') return
    answered.push(provider.id)
    groups.push(result.value)
  })

  if (groups.length === 0) throw fail(ERRORS.PROVIDER.UNAVAILABLE)

  const seen = new Set<string>()
  const items: TrackSummary[] = []

  for (let index = 0; items.length < options.limit; index += 1) {
    let tookSomething = false

    for (const group of groups) {
      const track = group[index]
      if (!track) continue

      tookSomething = true
      const key = identity(track)
      if (seen.has(key)) continue

      seen.add(key)
      items.push(track)
      if (items.length >= options.limit) break
    }

    if (!tookSomething) break
  }

  return { items, answered }
}
