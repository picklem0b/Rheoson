import { ERRORS, fail, streamTicketSchema, syntheticTrackId, trackSummarySchema } from '@rheoson/shared'
import type { StreamTicket, TrackSummary } from '@rheoson/shared'
import { z } from 'zod'
import type { MusicProvider, SearchOptions } from './provider'

/**
 * Deezer, as an adapter.
 *
 * Two jobs: a large search index with real artist and album names, and a chart
 * that gives the app a trending list without a key. Playback is a 30-second
 * preview, so the stream kind says so; the metadata is the part worth having.
 */

const API_ROOT = 'https://api.deezer.com'
const REQUEST_TIMEOUT_MS = 8_000
const PREVIEW_TTL_MS = 20 * 60_000
const PREVIEW_LIMIT = 200

const artistSchema = z.object({ name: z.string().min(1), picture_medium: z.string().nullish() })

const albumSchema = z.object({
  title: z.string().nullish(),
  cover_medium: z.string().nullish(),
  cover_xl: z.string().nullish(),
})

const deezerTrackSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  duration: z.number().nonnegative().nullish(),
  preview: z.string().nullish(),
  readable: z.boolean().optional(),
  artist: artistSchema.nullish(),
  album: albumSchema.nullish(),
})

type DeezerTrack = z.infer<typeof deezerTrackSchema>

const listBodySchema = z.object({ data: z.array(z.unknown()) })

/** Cached per isolate: a preview URL does not change for a given track. */
const previews = new Map<string, { url: string; at: number }>()

function rememberPreview(id: string, url: string | null | undefined): string | null {
  if (!url) return null

  if (previews.size >= PREVIEW_LIMIT) {
    const now = Date.now()
    for (const [key, entry] of previews) {
      if (now - entry.at >= PREVIEW_TTL_MS) previews.delete(key)
    }
    if (previews.size >= PREVIEW_LIMIT) previews.clear()
  }

  previews.set(id, { url, at: Date.now() })
  return url
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

async function request(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const url = new URL(`${API_ROOT}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal: withTimeout(signal) })
  } catch {
    throw fail(ERRORS.PROVIDER.UNAVAILABLE)
  }

  if (response.status === 404) throw fail(ERRORS.PROVIDER.NOT_FOUND)
  if (!response.ok) throw fail(ERRORS.PROVIDER.UNAVAILABLE)

  const body = await response.json().catch(() => {
    throw fail(ERRORS.PROVIDER.UNAVAILABLE)
  })

  // Deezer answers 200 with an `error` object for a bad id.
  if (body && typeof body === 'object' && 'error' in body) throw fail(ERRORS.PROVIDER.NOT_FOUND)

  return body
}

function toSummary(track: DeezerTrack): TrackSummary | null {
  rememberPreview(String(track.id), track.preview)

  const summary = trackSummarySchema.safeParse({
    id: syntheticTrackId('deezer', String(track.id)),
    title: track.title,
    artistName: track.artist?.name ?? 'Unknown artist',
    albumName: track.album?.title ?? null,
    artworkUrl: track.album?.cover_xl ?? track.album?.cover_medium ?? null,
    durationMs: Math.round((track.duration ?? 0) * 1000),
    provider: 'deezer',
    providerTrackId: String(track.id),
    isrc: null,
  })

  return summary.success ? summary.data : null
}

function summaries(items: unknown[]): TrackSummary[] {
  return items
    .map((item) => deezerTrackSchema.safeParse(item))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .filter((track) => track.readable !== false && Boolean(track.preview))
    .map(toSummary)
    .filter((track): track is TrackSummary => track !== null)
}

export function createDeezerProvider(): MusicProvider {
  return {
    id: 'deezer',
    label: 'Deezer',
    stream: 'preview',
    configured: true,

    async search({ query, limit, signal }: SearchOptions): Promise<TrackSummary[]> {
      const body = listBodySchema.parse(
        await request('/search', { q: query, limit: String(limit) }, signal),
      )

      return summaries(body.data)
    },

    async trending(limit: number, signal?: AbortSignal): Promise<TrackSummary[]> {
      const body = listBodySchema.parse(
        await request('/chart/0/tracks', { limit: String(limit) }, signal),
      )

      return summaries(body.data)
    },

    async resolveTrack(providerTrackId: string, signal?: AbortSignal): Promise<TrackSummary> {
      const body = deezerTrackSchema.safeParse(
        await request(`/track/${encodeURIComponent(providerTrackId)}`, {}, signal),
      )

      const summary = body.success ? toSummary(body.data) : null
      if (!summary) throw fail(ERRORS.PROVIDER.NOT_FOUND)
      return summary
    },

    async streamUrl(providerTrackId: string, signal?: AbortSignal): Promise<StreamTicket> {
      const cached = previews.get(providerTrackId)
      const fresh = cached && Date.now() - cached.at < PREVIEW_TTL_MS ? cached.url : null

      if (fresh) return streamTicketSchema.parse({ url: fresh, mime: 'audio/mpeg', expiresAt: null })

      const body = deezerTrackSchema.safeParse(
        await request(`/track/${encodeURIComponent(providerTrackId)}`, {}, signal),
      )
      const preview = body.success ? rememberPreview(providerTrackId, body.data.preview) : null

      if (!preview) throw fail(ERRORS.PROVIDER.NOT_FOUND)
      return streamTicketSchema.parse({ url: preview, mime: 'audio/mpeg', expiresAt: null })
    },
  }
}
