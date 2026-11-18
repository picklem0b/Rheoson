import { PROVIDERS, providerSchema } from '@rheoson/shared'
import type { Provider, TrackSummary } from '@rheoson/shared'
import type { Bindings } from '../env'
import { providerHealth } from '../providers/registry'

/**
 * The bridge between the V3 catalogue and the V2 screen.
 *
 * `apps/web` is main's V2 app, untouched, so it speaks the V2 API's shapes: a
 * track carries a nested artist and album, an artwork URL and a duration in
 * seconds, and its id is whatever the backend says. This file is the only place
 * that translation happens, so a provider adapter never learns a V2 field name
 * and the screen never learns a provider id.
 */

/** Provider ids that can appear before the colon in a bridge track id. */
const STREAMABLE: readonly Provider[] = PROVIDERS.filter((provider) => provider !== 'local')

export interface ParsedTrackId {
  provider: Provider
  providerTrackId: string
}

/**
 * `audius:abc123` is the whole identity: the dev server needs the provider to
 * resolve a stream, and the provider track id is what its API takes.
 *
 * The V3 contract keeps the two apart. The bridge joins them only because the
 * V2 client sends one opaque string back on the audio URL.
 */
export function parseTrackId(id: string): ParsedTrackId | null {
  const separator = id.indexOf(':')
  if (separator <= 0) return null

  const provider = providerSchema.safeParse(id.slice(0, separator))
  if (!provider.success || !STREAMABLE.includes(provider.data)) return null

  const providerTrackId = id.slice(separator + 1)
  if (!providerTrackId) return null

  return { provider: provider.data, providerTrackId }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function seconds(durationMs: number): number {
  return Math.max(0, Math.round(durationMs / 1000))
}

/**
 * The shape `normalizeTrack` reads. Extra fields are harmless; the ones it does
 * read are all here, including the empty `streamUrl` that tells the player to
 * ask the stream endpoint instead of trusting a stored URL.
 */
export function webTrack(track: TrackSummary) {
  const artistId = slug(track.artistName)

  return {
    id: `${track.provider}:${track.providerTrackId ?? ''}`,
    title: track.title,
    artist: {
      // Empty on purpose: a provider result has no artist page in this build,
      // so the UI falls back to a search instead of opening an empty profile.
      id: '',
      name: track.artistName,
      imageUrl: '',
      genres: [],
      followers: 0,
      monthlyListeners: 0,
      description: '',
      subscribers: '',
      topTracks: [],
      albums: [],
      singles: [],
      related: [],
    },
    album: {
      id: track.albumName ? `${track.provider}:album:${slug(track.albumName)}` : '',
      title: track.albumName ?? 'Single',
      artist: { id: '', name: track.artistName },
      artworkUrl: track.artworkUrl ?? '',
      releaseYear: 0,
      year: 0,
      trackCount: 1,
      tracks: [],
    },
    artworkUrl: track.artworkUrl ?? '',
    duration: seconds(track.durationMs),
    streamUrl: '',
    filePath: '',
    isDownloaded: false,
    isLiked: false,
    youtubeId: '',
    spotifyId: '',
    addedAt: '',
    trackNumber: 0,
    playCount: 0,
    rank: 0,
    provider: track.provider,
    providerTrackId: track.providerTrackId,
    artistKey: artistId,
  }
}

export function webTracks(items: TrackSummary[]) {
  return items.map(webTrack)
}

/** Albums and artists are derived from the tracks a search returned. */
export function webAlbums(items: TrackSummary[]) {
  const seen = new Set<string>()

  return items.flatMap((track) => {
    const title = track.albumName
    if (!title) return []

    const key = `${track.artistName}|${title}`.toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)

    return [
      {
        id: `${track.provider}:album:${slug(title)}`,
        title,
        artist: { id: '', name: track.artistName },
        artworkUrl: track.artworkUrl ?? '',
        releaseYear: 0,
        year: 0,
        trackCount: 0,
        tracks: [],
      },
    ]
  })
}

export function webArtists(items: TrackSummary[]) {
  const seen = new Set<string>()

  return items.flatMap((track) => {
    const key = track.artistName.toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)

    return [
      {
        id: '',
        name: track.artistName,
        imageUrl: '',
        genres: [],
        followers: 0,
        monthlyListeners: 0,
        description: '',
        subscribers: '',
        topTracks: [],
        albums: [],
        singles: [],
        related: [],
      },
    ]
  })
}

/**
 * `/api/health` as the V2 Doctor reads it.
 *
 * Every check is present even when it is skipped, because the screen renders one
 * row per check and "not configured" is information, not an error.
 */
export function webHealth(env: Bindings, uptimeSeconds: number) {
  const checkedAt = new Date().toISOString()
  const providers = providerHealth(env)
  const configured = providers.filter((provider) => provider.configured)
  const healthy = configured.length > 0

  return {
    schemaVersion: '3.2.0',
    service: 'rheoson-api',
    generatedAt: checkedAt,
    requestId: null,
    uptimeS: Math.round(uptimeSeconds),
    status: healthy ? 'passing' : 'degraded',
    checks: {
      providers: {
        status: healthy ? 'passing' : 'degraded',
        checkedAt,
        detail: providers
          .map((provider) => `${provider.label} (${provider.stream}${provider.configured ? '' : ', no key'})`)
          .join(' · '),
      },
      database: {
        status: 'skipped',
        checkedAt,
        detail: 'No database in the development bridge: likes, plays and playlists stay in the browser.',
      },
      storage: {
        status: 'skipped',
        checkedAt,
        detail: 'Audio is streamed from providers and never stored on the server.',
      },
    },
    summary: { passing: healthy ? 1 : 0, degraded: healthy ? 0 : 1, skipped: 2 },
  }
}
