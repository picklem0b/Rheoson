import { ERRORS, fail, streamTicketSchema, syntheticTrackId, trackSummarySchema } from '@rheoson/shared'
import type { StreamTicket, TrackSummary } from '@rheoson/shared'
import { z } from 'zod'
import type { MusicProvider, SearchOptions } from './provider'

/**
 * Jamendo, as an adapter.
 *
 * Independent-licence music with a real audio file behind every track, so this
 * is the second full-stream provider after Audius. It needs a `client_id` — the
 * free developer plan allows 35,000 requests a month, which is why every call in
 * this app is cached and the catalogue treats it as a peer of Audius rather than
 * a replacement for it.
 */

const API_ROOT = 'https://api.jamendo.com/v3.0'
const REQUEST_TIMEOUT_MS = 8_000

const jamendoTrackSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().min(1),
  duration: z.number().nonnegative().nullish(),
  artist_name: z.string().min(1),
  album_name: z.string().nullish(),
  image: z.string().nullish(),
  audio: z.string().nullish(),
  audiodownload_allowed: z.boolean().optional(),
})

type JamendoTrack = z.infer<typeof jamendoTrackSchema>

const listBodySchema = z.object({
  headers: z.object({ status: z.string(), code: z.number() }).passthrough(),
  results: z.array(z.unknown()),
})

function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export function createJamendoProvider(clientId: string | undefined): MusicProvider {
  const configured = Boolean(clientId)

  async function request(
    path: string,
    params: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<z.infer<typeof listBodySchema>> {
    if (!configured) throw fail(ERRORS.PROVIDER.UNAVAILABLE)

    const url = new URL(`${API_ROOT}${path}`)
    url.searchParams.set('client_id', clientId as string)
    url.searchParams.set('format', 'json')
    url.searchParams.set('audioformat', 'mp32')
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

    let response: Response
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' }, signal: withTimeout(signal) })
    } catch {
      throw fail(ERRORS.PROVIDER.UNAVAILABLE)
    }

    if (!response.ok) throw fail(ERRORS.PROVIDER.UNAVAILABLE)

    const body = listBodySchema.parse(await response.json().catch(() => {
      throw fail(ERRORS.PROVIDER.UNAVAILABLE)
    }))

    if (body.headers.status !== 'success') throw fail(ERRORS.PROVIDER.UNAVAILABLE)

    return body
  }

  /** Jamendo's image host takes a width, so the card gets a retina-sized cover. */
  function artwork(url: string | null | undefined): string | null {
    if (!url) return null
    return url.replace(/([?&])width=\d+/, '$1width=600')
  }

  function toSummary(track: JamendoTrack): TrackSummary | null {
    const summary = trackSummarySchema.safeParse({
      id: syntheticTrackId('jamendo', track.id),
      title: track.name,
      artistName: track.artist_name,
      albumName: track.album_name ?? null,
      artworkUrl: artwork(track.image),
      durationMs: Math.round((track.duration ?? 0) * 1000),
      provider: 'jamendo',
      providerTrackId: track.id,
      isrc: null,
    })

    return summary.success ? summary.data : null
  }

  function summaries(items: unknown[]): TrackSummary[] {
    return items
      .map((item) => jamendoTrackSchema.safeParse(item))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data)
      .filter((track) => track.audiodownload_allowed !== false && Boolean(track.audio))
      .map(toSummary)
      .filter((track): track is TrackSummary => track !== null)
  }

  return {
    id: 'jamendo',
    label: 'Jamendo',
    stream: 'full',
    configured,

    async search({ query, limit, signal }: SearchOptions): Promise<TrackSummary[]> {
      const body = await request('/tracks/', { search: query, limit: String(limit) }, signal)
      return summaries(body.results)
    },

    async trending(limit: number, signal?: AbortSignal): Promise<TrackSummary[]> {
      const body = await request(
        '/tracks/',
        { order: 'popularity_week', limit: String(limit) },
        signal,
      )
      return summaries(body.results)
    },

    async resolveTrack(providerTrackId: string, signal?: AbortSignal): Promise<TrackSummary> {
      const body = await request('/tracks/', { id: providerTrackId, limit: '1' }, signal)
      const parsed = jamendoTrackSchema.safeParse(body.results[0])
      const summary = parsed.success ? toSummary(parsed.data) : null

      if (!summary) throw fail(ERRORS.PROVIDER.NOT_FOUND)
      return summary
    },

    async streamUrl(providerTrackId: string, signal?: AbortSignal): Promise<StreamTicket> {
      const body = await request('/tracks/', { id: providerTrackId, limit: '1' }, signal)
      const parsed = jamendoTrackSchema.safeParse(body.results[0])

      if (!parsed.success || !parsed.data.audio) throw fail(ERRORS.PROVIDER.NOT_FOUND)

      return streamTicketSchema.parse({
        url: parsed.data.audio,
        mime: 'audio/mpeg',
        expiresAt: null,
      })
    },
  }
}
