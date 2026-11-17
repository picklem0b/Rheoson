import {
  ERRORS,
  fail,
  isrcSchema,
  streamTicketSchema,
  syntheticTrackId,
  trackSummarySchema,
} from '@rheoson/shared'
import type { StreamTicket, TrackSummary } from '@rheoson/shared'
import { z } from 'zod'
import type { MusicProvider, SearchOptions } from './provider'

/**
 * Audius, as an adapter.
 *
 * Two facts shape this file. Audius is a network of discovery nodes behind one
 * address, so the host is fetched once and reused until it goes stale. And its
 * tracks are searchable without a key, but the stream is a signed URL that lives
 * for minutes, which is why it is resolved per play and never stored.
 *
 * Anything Audius calls a field and we do not is dropped here rather than
 * leaking into a contract.
 */

const API_ROOT = 'https://api.audius.co'
const DEFAULT_HOST = 'https://discoveryprovider.audius.co'
const HOST_TTL_MS = 5 * 60_000
const REQUEST_TIMEOUT_MS = 8_000

const audiusTrackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  duration: z.number().nonnegative().nullish(),
  isrc: z.string().nullish(),
  is_streamable: z.boolean().optional(),
  is_delete: z.boolean().optional(),
  // Audius mixes sizes with a `mirrors` array here, so the adapter reads values
  // itself and keeps only the ones that are actually picture URLs.
  artwork: z.record(z.string(), z.unknown()).nullish(),
  album_backlink: z.object({ playlist_name: z.string().nullish() }).nullish(),
  user: z.object({ name: z.string().min(1) }).nullish(),
})

type AudiusTrack = z.infer<typeof audiusTrackSchema>

const searchBodySchema = z.object({ data: z.array(z.unknown()) })
const trackBodySchema = z.object({ data: z.unknown() })
const streamBodySchema = z.object({ data: z.url() })
const hostsBodySchema = z.object({ data: z.array(z.url()) })

let cachedHost: { url: string; at: number } | null = null

/** The node list is fetched once per isolate; a failure falls back, never throws. */
async function pickHost(signal?: AbortSignal): Promise<string> {
  if (cachedHost && Date.now() - cachedHost.at < HOST_TTL_MS) return cachedHost.url

  try {
    const response = await fetch(API_ROOT, { signal: withTimeout(signal) })
    if (!response.ok) throw new Error(`host list answered ${response.status}`)
    const host = hostsBodySchema.parse(await response.json()).data[0]
    if (!host) throw new Error('host list is empty')
    cachedHost = { url: host, at: Date.now() }
    return host
  } catch {
    return cachedHost?.url ?? DEFAULT_HOST
  }
}

/** One timeout per request, and the caller's abort still wins. */
function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

async function request(
  path: string,
  appName: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  const host = await pickHost(signal)
  const url = new URL(`${host.replace(/\/+$/, '')}/v1${path}`)
  url.searchParams.set('app_name', appName)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: withTimeout(signal),
    })
  } catch {
    throw fail(ERRORS.PROVIDER.UNAVAILABLE)
  }

  if (response.status === 404) throw fail(ERRORS.PROVIDER.NOT_FOUND)
  if (!response.ok) throw fail(ERRORS.PROVIDER.UNAVAILABLE)

  return response.json().catch(() => {
    throw fail(ERRORS.PROVIDER.UNAVAILABLE)
  })
}

/** The largest artwork Audius offers, so a card is never blurry on a phone. */
const ARTWORK_ORDER = ['480x480', '1000x1000', '150x150']

function artworkUrl(track: AudiusTrack): string | null {
  const sizes = track.artwork
  if (!sizes) return null

  const candidates = [...ARTWORK_ORDER.map((key) => sizes[key]), ...Object.values(sizes)]

  for (const candidate of candidates) {
    const url = z.url().safeParse(candidate)
    if (url.success) return url.data
  }

  return null
}

function toSummary(track: AudiusTrack): TrackSummary | null {
  const isrc = track.isrc?.trim() ? isrcSchema.safeParse(track.isrc) : null

  const summary = trackSummarySchema.safeParse({
    id: syntheticTrackId('audius', track.id),
    title: track.title,
    artistName: track.user?.name ?? 'Unknown artist',
    albumName: track.album_backlink?.playlist_name ?? null,
    artworkUrl: artworkUrl(track),
    durationMs: Math.max(0, Math.round((track.duration ?? 0) * 1000)),
    provider: 'audius',
    providerTrackId: track.id,
    // One malformed ISRC must not empty a whole result page, so it degrades to
    // null instead of failing the parse.
    isrc: isrc?.success ? isrc.data : null,
  })

  return summary.success ? summary.data : null
}

function playable(track: AudiusTrack): boolean {
  return track.is_streamable !== false && track.is_delete !== true
}

/** The signature embeds its own expiry; reading it beats inventing one. */
function signatureExpiry(url: string): string | null {
  try {
    const raw = new URL(url).searchParams.get('signature')
    if (!raw) return null
    const outer: unknown = JSON.parse(raw)
    if (typeof outer !== 'object' || outer === null || !('data' in outer)) return null
    const inner: unknown = JSON.parse(String((outer as { data: unknown }).data))
    if (typeof inner !== 'object' || inner === null || !('timestamp' in inner)) return null
    const timestamp = Number((inner as { timestamp: unknown }).timestamp)
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
  } catch {
    return null
  }
}

export function createAudiusProvider(appName: string): MusicProvider {
  return {
    id: 'audius',

    async search({ query, limit, signal }: SearchOptions): Promise<TrackSummary[]> {
      const body = searchBodySchema.parse(
        await request('/tracks/search', appName, { query, limit: String(limit) }, signal),
      )

      return body.data
        .map((item) => audiusTrackSchema.safeParse(item))
        .filter((parsed) => parsed.success)
        .map((parsed) => parsed.data)
        .filter(playable)
        .map(toSummary)
        .filter((track): track is TrackSummary => track !== null)
    },

    async resolveTrack(providerTrackId: string, signal?: AbortSignal): Promise<TrackSummary> {
      const body = trackBodySchema.parse(
        await request(`/tracks/${encodeURIComponent(providerTrackId)}`, appName, {}, signal),
      )
      const parsed = audiusTrackSchema.safeParse(body.data)
      const summary = parsed.success && playable(parsed.data) ? toSummary(parsed.data) : null
      if (!summary) throw fail(ERRORS.PROVIDER.NOT_FOUND)
      return summary
    },

    async streamUrl(providerTrackId: string, signal?: AbortSignal): Promise<StreamTicket> {
      const body = streamBodySchema.parse(
        await request(
          `/tracks/${encodeURIComponent(providerTrackId)}/stream`,
          appName,
          { no_redirect: 'true' },
          signal,
        ),
      )

      return streamTicketSchema.parse({
        url: body.data,
        mime: 'audio/mpeg',
        expiresAt: signatureExpiry(body.data),
      })
    },
  }
}
