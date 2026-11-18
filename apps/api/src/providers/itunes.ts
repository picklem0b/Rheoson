import { ERRORS, fail, isrcSchema, streamTicketSchema, syntheticTrackId, trackSummarySchema } from '@rheoson/shared'
import type { StreamTicket, TrackSummary } from '@rheoson/shared'
import { z } from 'zod'
import type { MusicProvider, SearchOptions } from './provider'

/**
 * The iTunes Search API, as an adapter.
 *
 * It needs no key and no account, which makes it the provider that always has
 * something to show on the first run. What it does not have is full tracks: the
 * playable URL is a 30-second preview, so this adapter is honest about being a
 * `preview` stream rather than pretending to be a catalogue.
 */

const API_ROOT = 'https://itunes.apple.com'
const REQUEST_TIMEOUT_MS = 8_000
const PREVIEW_TTL_MS = 20 * 60_000
const PREVIEW_LIMIT = 200

const itunesTrackSchema = z.object({
  trackId: z.number().int(),
  trackName: z.string().min(1),
  artistName: z.string().min(1),
  collectionName: z.string().nullish(),
  artworkUrl100: z.string().nullish(),
  trackTimeMillis: z.number().nonnegative().nullish(),
  previewUrl: z.string().nullish(),
  isrc: z.string().nullish(),
})

type ItunesTrack = z.infer<typeof itunesTrackSchema>

const searchBodySchema = z.object({
  resultCount: z.number(),
  results: z.array(z.unknown()),
})

const lookupBodySchema = z.object({
  results: z.array(z.unknown()),
})

/** Preview URLs are stable for a while, so a play after a search is free. */
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

/** 100px thumbnails are what search returns; ask the same host for 600px. */
function largeArtwork(url: string | null | undefined): string | null {
  if (!url) return null
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/600x600bb.$1')
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

  return response.json().catch(() => {
    throw fail(ERRORS.PROVIDER.UNAVAILABLE)
  })
}

function toSummary(track: ItunesTrack): TrackSummary | null {
  const isrc = track.isrc?.trim() ? isrcSchema.safeParse(track.isrc) : null

  rememberPreview(String(track.trackId), track.previewUrl)

  const summary = trackSummarySchema.safeParse({
    id: syntheticTrackId('itunes', String(track.trackId)),
    title: track.trackName,
    artistName: track.artistName,
    albumName: track.collectionName ?? null,
    artworkUrl: largeArtwork(track.artworkUrl100),
    durationMs: Math.round(track.trackTimeMillis ?? 0),
    provider: 'itunes',
    providerTrackId: String(track.trackId),
    isrc: isrc?.success ? isrc.data : null,
  })

  return summary.success ? summary.data : null
}

function summaries(items: unknown[]): TrackSummary[] {
  return items
    .map((item) => itunesTrackSchema.safeParse(item))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .filter((track) => Boolean(track.previewUrl))
    .map(toSummary)
    .filter((track): track is TrackSummary => track !== null)
}

export function createItunesProvider(): MusicProvider {
  return {
    id: 'itunes',
    label: 'Apple iTunes',
    stream: 'preview',
    configured: true,

    async search({ query, limit, signal }: SearchOptions): Promise<TrackSummary[]> {
      const body = searchBodySchema.parse(
        await request('/search', { term: query, entity: 'song', media: 'music', limit: String(limit) }, signal),
      )

      return summaries(body.results)
    },

    async resolveTrack(providerTrackId: string, signal?: AbortSignal): Promise<TrackSummary> {
      const body = lookupBodySchema.parse(await request('/lookup', { id: providerTrackId }, signal))
      const parsed = itunesTrackSchema.safeParse(body.results[0])
      const summary = parsed.success ? toSummary(parsed.data) : null
      if (!summary) throw fail(ERRORS.PROVIDER.NOT_FOUND)
      return summary
    },

    async streamUrl(providerTrackId: string, signal?: AbortSignal): Promise<StreamTicket> {
      const cached = previews.get(providerTrackId)
      const fresh = cached && Date.now() - cached.at < PREVIEW_TTL_MS ? cached.url : null

      if (fresh) return streamTicketSchema.parse({ url: fresh, mime: 'audio/mp4', expiresAt: null })

      const body = lookupBodySchema.parse(await request('/lookup', { id: providerTrackId }, signal))
      const parsed = itunesTrackSchema.safeParse(body.results[0])
      const preview = parsed.success ? rememberPreview(providerTrackId, parsed.data.previewUrl) : null

      if (!preview) throw fail(ERRORS.PROVIDER.NOT_FOUND)
      return streamTicketSchema.parse({ url: preview, mime: 'audio/mp4', expiresAt: null })
    },
  }
}
