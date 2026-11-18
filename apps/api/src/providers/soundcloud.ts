import { ERRORS, fail, streamTicketSchema, syntheticTrackId, trackSummarySchema } from '@rheoson/shared'
import type { StreamTicket, TrackSummary } from '@rheoson/shared'
import { z } from 'zod'
import type { MusicProvider, SearchOptions } from './provider'

/**
 * SoundCloud, as an adapter.
 *
 * Creator uploads, and a stream that is not one URL but two calls: the track
 * document lists its transcodings, and the progressive one is the file an audio
 * element can play. It needs a `client_id` from a SoundCloud app, so the adapter
 * reports itself unconfigured until one is supplied and the catalogue simply
 * moves on.
 */

const API_ROOT = 'https://api-v2.soundcloud.com'
const REQUEST_TIMEOUT_MS = 8_000

const soundcloudTrackSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  duration: z.number().nonnegative().nullish(),
  artwork_url: z.string().nullish(),
  streamable: z.boolean().optional(),
  access: z.enum(['playable', 'preview', 'blocked']).optional(),
  user: z.object({ username: z.string().min(1) }).nullish(),
})

type SoundcloudTrack = z.infer<typeof soundcloudTrackSchema>

const searchBodySchema = z.object({ collection: z.array(z.unknown()) })

const streamBodySchema = z.object({ url: z.url() })

const transcodingSchema = z.object({
  url: z.url(),
  is_progressive: z.boolean().optional(),
  format: z.object({ mime_type: z.string().nullish() }).nullish(),
})

function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export function createSoundcloudProvider(clientId: string | undefined): MusicProvider {
  const configured = Boolean(clientId)

  async function request(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
    if (!configured) throw fail(ERRORS.PROVIDER.UNAVAILABLE)

    const url = new URL(`${API_ROOT}${path}`)
    url.searchParams.set('client_id', clientId as string)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

    let response: Response
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' }, signal: withTimeout(signal) })
    } catch {
      throw fail(ERRORS.PROVIDER.UNAVAILABLE)
    }

    if (response.status === 404) throw fail(ERRORS.PROVIDER.NOT_FOUND)
    if (!response.ok) throw fail(ERRORS.PROVIDER.UNAVAILABLE)

    return response.json().catch(() => {
      throw fail(ERRORS.PROVIDER.UNAVAILABLE)
    })
  }

  function artwork(url: string | null | undefined): string | null {
    if (!url) return null
    return url.replace(/-large\.(jpg|png)$/, '-t500x500.$1')
  }

  function toSummary(track: SoundcloudTrack): TrackSummary | null {
    const summary = trackSummarySchema.safeParse({
      id: syntheticTrackId('soundcloud', String(track.id)),
      title: track.title,
      artistName: track.user?.username ?? 'Unknown artist',
      albumName: null,
      artworkUrl: artwork(track.artwork_url),
      durationMs: Math.round(track.duration ?? 0),
      provider: 'soundcloud',
      providerTrackId: String(track.id),
      isrc: null,
    })

    return summary.success ? summary.data : null
  }

  function playable(track: SoundcloudTrack): boolean {
    return track.streamable !== false && track.access !== 'blocked'
  }

  function summaries(items: unknown[]): TrackSummary[] {
    return items
      .map((item) => soundcloudTrackSchema.safeParse(item))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data)
      .filter(playable)
      .map(toSummary)
      .filter((track): track is TrackSummary => track !== null)
  }

  return {
    id: 'soundcloud',
    label: 'SoundCloud',
    stream: 'full',
    configured,

    async search({ query, limit, signal }: SearchOptions): Promise<TrackSummary[]> {
      const body = searchBodySchema.parse(
        await request('/search/tracks', { q: query, limit: String(limit), linked_partitioning: '0' }, signal),
      )

      return summaries(body.collection)
    },

    async resolveTrack(providerTrackId: string, signal?: AbortSignal): Promise<TrackSummary> {
      const parsed = soundcloudTrackSchema.safeParse(
        await request(`/tracks/${encodeURIComponent(providerTrackId)}`, {}, signal),
      )

      const summary = parsed.success && playable(parsed.data) ? toSummary(parsed.data) : null
      if (!summary) throw fail(ERRORS.PROVIDER.NOT_FOUND)
      return summary
    },

    async streamUrl(providerTrackId: string, signal?: AbortSignal): Promise<StreamTicket> {
      const track = z
        .object({ media: z.object({ transcodings: z.array(transcodingSchema) }).nullish() })
        .parse(await request(`/tracks/${encodeURIComponent(providerTrackId)}`, {}, signal))

      const progressive = track.media?.transcodings.find(
        (transcoding) => transcoding.is_progressive || transcoding.format?.mime_type === 'audio/mpeg',
      )

      if (!progressive) throw fail(ERRORS.PROVIDER.NOT_FOUND)

      const ticket = streamBodySchema.parse(
        await requestAbsolute(progressive.url, clientId as string, signal),
      )

      return streamTicketSchema.parse({ url: ticket.url, mime: 'audio/mpeg', expiresAt: null })
    },
  }
}

/** The transcoding URL already carries its own origin; only the key is added. */
async function requestAbsolute(
  rawUrl: string,
  clientId: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = new URL(rawUrl)
  url.searchParams.set('client_id', clientId)

  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal: withTimeout(signal) })
  } catch {
    throw fail(ERRORS.PROVIDER.UNAVAILABLE)
  }

  if (!response.ok) throw fail(ERRORS.PROVIDER.UNAVAILABLE)

  return response.json().catch(() => {
    throw fail(ERRORS.PROVIDER.UNAVAILABLE)
  })
}
