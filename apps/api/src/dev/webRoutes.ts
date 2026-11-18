import { failedBody } from './webFailures'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Bindings } from '../env'
import type { AppEnv } from '../env'
import { resolveStream, resolveTrack, searchTracks, trendingTracks } from '../services/catalogue'
import { searchProviders } from '../providers/registry'
import { parseTrackId, webAlbums, webArtists, webHealth, webTrack, webTracks } from './webShape'

/**
 * The V2 API surface, served by the V3 backend for the copied V2 app.
 *
 * `apps/web` is main's V2 client, kept byte-for-byte, and it asks for `/api/...`
 * with V2 shapes. This router is the development bridge between those requests
 * and the V3 catalogue: it exists so the exact old screen runs against the new
 * providers, and it never returns a 5xx — a provider that is down, a missing key
 * or a feature this build does not have yet answers as an empty, well-shaped
 * success or a 4xx the client already renders inline.
 */

const startedAt = Date.now()

export const webRoutes = new Hono<AppEnv>()

// ── Helpers ───────────────────────────────────────────────────

function limitFrom(raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? fallback)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(50, Math.floor(value))
}

/** ISO week label, so the chart cache and the UI agree on which week it is. */
function weekLabel(date = new Date()): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)

  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)

  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** The genres the search screen can drill into. Labels double as search terms. */
const CATEGORIES = [
  { slug: 'afrobeats', label: 'Afrobeats', emoji: '🪘', gradient: 'from-green-900/90 to-emerald-700/90' },
  { slug: 'amapiano', label: 'Amapiano', emoji: '🎹', gradient: 'from-teal-900/90 to-cyan-700/90' },
  { slug: 'hip-hop', label: 'Hip-Hop', emoji: '🎤', gradient: 'from-yellow-900/90 to-orange-800/90' },
  { slug: 'r-and-b', label: 'R&B', emoji: '🎶', gradient: 'from-rose-900/90 to-pink-800/90' },
  { slug: 'pop', label: 'Pop', emoji: '✨', gradient: 'from-violet-900/90 to-purple-700/90' },
  { slug: 'electronic', label: 'Electronic', emoji: '🎛️', gradient: 'from-cyan-900/90 to-blue-800/90' },
  { slug: 'rock', label: 'Rock', emoji: '🎸', gradient: 'from-zinc-900/90 to-zinc-700/90' },
  { slug: 'jazz', label: 'Jazz', emoji: '🎷', gradient: 'from-amber-900/90 to-yellow-700/90' },
  { slug: 'classical', label: 'Classical', emoji: '🎻', gradient: 'from-slate-900/90 to-slate-700/90' },
  { slug: 'soul', label: 'Soul', emoji: '🎙️', gradient: 'from-red-900/90 to-rose-800/90' },
] as const

const MIX_SEEDS = [
  { id: 'mix-electronic', title: 'Daily Mix 1', subtitle: 'Electronic', query: 'electronic' },
  { id: 'mix-afrobeats', title: 'Daily Mix 2', subtitle: 'Afrobeats', query: 'afrobeats' },
  { id: 'mix-lofi', title: 'Daily Mix 3', subtitle: 'Lo-fi', query: 'lofi beats' },
  { id: 'mix-soul', title: 'Daily Mix 4', subtitle: 'Soul', query: 'soul' },
] as const

const MIX_TTL_MS = 30 * 60_000
let mixCache: { at: number; mixes: unknown[] } | null = null

function blockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host === '::1' || host === '[::1]') return true
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  return false
}

// ── Health and version ────────────────────────────────────────

webRoutes.get('/health', (c) =>
  c.json(webHealth(c.env as Bindings, (Date.now() - startedAt) / 1000)),
)

webRoutes.get('/health/diag', (c) =>
  c.json({
    ...webHealth(c.env as Bindings, (Date.now() - startedAt) / 1000),
    diagnostics: { forceRefreshedAt: new Date().toISOString() },
  }),
)

webRoutes.get('/health/selftest', (c) =>
  c.json({
    schemaVersion: 1,
    status: 'skipped',
    totalMs: 0,
    checks: [],
    summary: { pass: 0, warn: 0, fail: 0, skipped: 1 },
  }),
)

webRoutes.get('/version', (c) =>
  c.json({ version: '2.23.3', name: 'Rheoson', releaseDate: new Date().toISOString() }),
)

// ── Search ────────────────────────────────────────────────────

webRoutes.get('/search', async (c) => {
  const query = (c.req.query('q') ?? '').trim()
  const limit = limitFrom(c.req.query('limit'), 30)

  if (!query) return c.json({ query: '', tracks: [], albums: [], artists: [], playlists: [] })

  try {
    const { items } = await searchProviders(c.env as Bindings, {
      query,
      limit,
      signal: c.req.raw.signal,
    })

    return c.json({
      query,
      tracks: webTracks(items),
      albums: webAlbums(items),
      artists: webArtists(items),
      playlists: [],
      providers: [...new Set(items.map((track) => track.provider))],
    })
  } catch {
    return c.json({ query, tracks: [], albums: [], artists: [], playlists: [] })
  }
})

webRoutes.get('/search/suggest', (c) => {
  const query = (c.req.query('q') ?? '').trim()
  return c.json(query ? [query] : [])
})

webRoutes.post('/search/resolve', (c) =>
  c.json(failedBody('Link resolving needs a provider that can match a URL to a recording; this build searches instead.'), 400),
)

webRoutes.get('/search/categories', (c) =>
  c.json({ week: weekLabel(), categories: CATEGORIES }),
)

webRoutes.get('/search/categories/:slug/top', async (c) => {
  const slug = c.req.param('slug')
  const category = CATEGORIES.find((entry) => entry.slug === slug) ?? null
  const limit = limitFrom(c.req.query('limit'), 5)

  if (!category) return c.json({ week: weekLabel(), category: null, tracks: [] })

  try {
    const items = await searchTracks(
      c.env as Bindings,
      { q: category.label, limit },
      c.req.raw.signal,
    )
    return c.json({ week: weekLabel(), category, tracks: webTracks(items) })
  } catch {
    return c.json({ week: weekLabel(), category, tracks: [] })
  }
})

// ── Tracks ────────────────────────────────────────────────────

webRoutes.get('/tracks/trending/weekly', async (c) => {
  const limit = limitFrom(c.req.query('limit'), 10)

  try {
    const { items } = await trendingTracks(c.env as Bindings, limit, c.req.raw.signal)
    return c.json({ week: weekLabel(), tracks: webTracks(items) })
  } catch {
    return c.json({ week: weekLabel(), tracks: [] })
  }
})

webRoutes.get('/tracks/trending', async (c) => {
  const limit = limitFrom(c.req.query('limit'), 20)

  try {
    const { items } = await trendingTracks(c.env as Bindings, limit, c.req.raw.signal)
    return c.json(webTracks(items))
  } catch {
    return c.json([])
  }
})

webRoutes.get('/tracks/liked', (c) => c.json([]))
webRoutes.get('/tracks/liked/count', (c) => c.json({ count: 0 }))

/** History and likes live in the browser's IndexedDB in this build. */
webRoutes.get('/tracks/recently-played', (c) => c.json([]))
webRoutes.delete('/tracks/history', (c) => c.json({ ok: true }))

webRoutes.get('/tracks/', (c) => c.json([]))
webRoutes.get('/tracks/signals', (c) => c.json({ signals: [] }))

webRoutes.post('/tracks/:id/like', (c) => c.json({ liked: true, count: 1 }))
webRoutes.delete('/tracks/:id/like', (c) => c.json({ liked: false, count: 0 }))
webRoutes.post('/tracks/:id/dislike', (c) => c.json({ disliked: true, count: 0 }))
webRoutes.delete('/tracks/:id/dislike', (c) => c.json({ disliked: false, count: 0 }))
webRoutes.post('/tracks/:id/play', (c) => c.body(null, 204))

webRoutes.get('/tracks/:id', async (c) => {
  const parsed = parseTrackId(c.req.param('id'))
  if (!parsed) return c.json(failedBody('That track id is not from a streaming provider.'), 404)

  try {
    const track = await resolveTrack(
      c.env as Bindings,
      parsed.provider,
      parsed.providerTrackId,
      c.req.raw.signal,
    )
    return c.json(webTrack(track))
  } catch {
    return c.json(failedBody('That track is not available any more.'), 404)
  }
})

// ── Streams ───────────────────────────────────────────────────

webRoutes.post('/stream/cache/clear', (c) => c.json({ ok: true }))
webRoutes.post('/stream/artwork/cache/clear', (c) => c.json({ ok: true }))
webRoutes.post('/stream/remote-cache/clear', (c) => c.json({ ok: true }))

/**
 * The audio itself, proxied from the provider.
 *
 * A redirect would be cheaper, but every hop would then need the provider to
 * send CORS headers to this origin, and Howler's Web Audio path breaks silently
 * when one does not. Proxying keeps playback same-origin and forwards Range so
 * seeking still works.
 */
webRoutes.get('/stream/:id/audio', async (c) => {
  const parsed = parseTrackId(c.req.param('id'))
  if (!parsed) return c.json(failedBody('Unknown audio track.'), 404)

  try {
    const ticket = await resolveStream(
      c.env as Bindings,
      parsed.provider,
      parsed.providerTrackId,
      c.req.raw.signal,
    )

    const range = c.req.header('range')
    const upstream = await fetch(ticket.url, {
      headers: { Accept: '*/*', ...(range ? { Range: range } : {}) },
      redirect: 'follow',
    })

    if (!upstream.ok && upstream.status !== 206) {
      return c.json(failedBody(`The provider answered ${upstream.status} for this track.`), 404)
    }

    const headers: Record<string, string> = {}
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name)
      if (value) headers[name] = value
    }
    headers['content-type'] ??= ticket.mime
    headers['accept-ranges'] ??= 'bytes'
    headers['access-control-allow-origin'] = '*'

    return c.newResponse(upstream.body, upstream.status as 200 | 206, headers)
  } catch {
    return c.json(failedBody('This track is not playable right now.'), 404)
  }
})

/** Remote artwork stays same-origin so the client can analyse it safely. */
webRoutes.get('/stream/:id/artwork-proxy', async (c) => {
  const raw = c.req.query('url')
  const parsed = raw ? z.url().safeParse(raw) : null

  if (!parsed?.success) return c.body(null, 404)

  const target = parsed.data
  if (!/^https?:/i.test(target)) return c.body(null, 404)

  try {
    if (blockedHost(new URL(target).hostname)) return c.body(null, 404)

    const upstream = await fetch(target, { headers: { Accept: 'image/*' }, redirect: 'follow' })
    if (!upstream.ok) return c.body(null, 404)

    return c.newResponse(upstream.body, 200, {
      'content-type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
    })
  } catch {
    return c.body(null, 404)
  }
})

/**
 * No provider in the catalogue ships lyrics yet, so the answer is an empty
 * lyric sheet rather than a 404: the player already renders "no lyrics for
 * this track", and a failed request on every track would be console noise
 * that hides real failures.
 */
webRoutes.get('/lyrics/:id', (c) =>
  c.json({
    trackId: c.req.param('id'),
    synced: false,
    lines: [],
    source: 'none',
  }),
)

/**
 * Stream warm-up. The V2 client calls this before a track starts to pay the
 * provider handshake early; resolving the ticket is exactly that work.
 */
webRoutes.post('/stream/:id/warm', async (c) => {
  const parsed = parseTrackId(c.req.param('id'))
  if (!parsed) return c.json({ ok: false })

  try {
    await resolveStream(
      c.env as Bindings,
      parsed.provider,
      parsed.providerTrackId,
      c.req.raw.signal,
    )
    return c.json({ ok: true })
  } catch {
    return c.json({ ok: false })
  }
})

// ── Recommendations ───────────────────────────────────────────

webRoutes.get('/recommendations/mixes', async (c) => {
  if (mixCache && Date.now() - mixCache.at < MIX_TTL_MS) return c.json({ mixes: mixCache.mixes })

  const mixes: unknown[] = []

  for (const seed of MIX_SEEDS) {
    try {
      const items = await searchTracks(c.env as Bindings, { q: seed.query, limit: 8 }, c.req.raw.signal)
      if (items.length === 0) continue

      const tracks = webTracks(items)
      mixes.push({
        id: seed.id,
        title: seed.title,
        subtitle: seed.subtitle,
        artworkUrl: tracks[0]?.artworkUrl ?? '',
        tracks,
      })
    } catch {
      // One empty seed is one missing card, not a broken Home.
    }
  }

  mixCache = { at: Date.now(), mixes }
  return c.json({ mixes })
})

webRoutes.get('/recommendations/home', (c) =>
  c.json({ sections: [], updated_at: new Date().toISOString() }),
)

webRoutes.get('/recommendations/taste', (c) =>
  c.json({
    total_plays: 0,
    total_likes: 0,
    total_skips: 0,
    avg_completion_rate: 0,
    top_artists: [],
    top_genres: [],
    top_tracks: [],
    persona: null,
    cold_start: true,
    last_updated: new Date().toISOString(),
  }),
)

webRoutes.get('/recommendations/autoplay', (c) => c.json({ tracks: [] }))
webRoutes.get('/recommendations/discover', (c) => c.json({ track_ids: [] }))
webRoutes.get('/recommendations/radio', (c) => c.json({ seed: null, tracks: [] }))
webRoutes.post('/recommendations/refresh', (c) => c.json({ ok: true, sections: 0 }))

webRoutes.post('/recommendations/onboard', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const artists = Array.isArray((body as { artists?: unknown }).artists)
    ? ((body as { artists: unknown[] }).artists.map(String).slice(0, 8))
    : []

  // No taste table yet: answer honestly rather than inventing a profile.
  return c.json({ ok: true, seeded: 0, artists })
})

// ── Analytics ─────────────────────────────────────────────────

webRoutes.get('/analytics/stats', (c) =>
  c.json({
    total_plays: 0,
    plays_7d: 0,
    plays_30d: 0,
    total_likes: 0,
    unique_artists_30d: 0,
    active_days_30d: 0,
    estimated_listening_hours: 0,
    current_streak: 0,
    longest_streak: 0,
  }),
)

webRoutes.get('/analytics/top-artists', (c) => c.json({ artists: [] }))
webRoutes.get('/analytics/top-tracks', (c) => c.json({ tracks: [] }))
webRoutes.get('/analytics/listening-by-hour', (c) => c.json({ hours: [] }))
webRoutes.get('/analytics/listening-by-day', (c) => c.json({ days: [] }))

webRoutes.get('/analytics/wrapped', (c) =>
  c.json({
    year: new Date().getFullYear(),
    top_artists: [],
    top_tracks: [],
    total_plays: 0,
    total_minutes: 0,
    months: [],
    genres: [],
    streaks: { current_streak: 0, longest_streak: 0 },
    top_decade: null,
  }),
)

// ── Playlists, library, artists ───────────────────────────────

webRoutes.get('/playlists', (c) => c.json([]))
webRoutes.get('/playlists/:id', (c) => c.json(failedBody('Playlists are kept in the browser in this build.'), 404))
webRoutes.post('/playlists', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { title?: string; name?: string }
  const title = body.title ?? body.name ?? 'New playlist'

  return c.json({
    id: `local-${Date.now()}`,
    title,
    description: '',
    artworkUrl: '',
    tracks: [],
    trackIds: [],
    trackCount: 0,
    isLocal: true,
    spotifyId: '',
    totalDuration: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
})
webRoutes.patch('/playlists/:id', (c) => c.json({ ok: true }))
webRoutes.delete('/playlists/:id', (c) => c.json({ ok: true }))
webRoutes.post('/playlists/:id/tracks', (c) => c.json({ ok: true }))
webRoutes.delete('/playlists/:id/tracks/:trackId', (c) => c.json({ ok: true }))
webRoutes.put('/playlists/:id/tracks/reorder', (c) => c.json({ ok: true }))
webRoutes.post('/playlists/import', (c) => c.json({ ok: true, tracks: [] }))

webRoutes.get('/library/albums', (c) => c.json([]))
webRoutes.get('/library/albums/:id', (c) => c.json(failedBody('No saved albums in this build.'), 404))
webRoutes.get('/library/artists', (c) => c.json([]))
webRoutes.get('/library/featured', (c) => c.json([]))

webRoutes.get('/artists/following', (c) => c.json({ artists: [] }))
webRoutes.get('/artists/:id/status', (c) =>
  c.json({ isFollowing: false, latestRelease: null, isNewRelease: false }),
)
webRoutes.post('/artists/:id/follow', (c) =>
  c.json({
    isFollowing: true,
    artist: {
      id: c.req.param('id'),
      name: decodeURIComponent(c.req.param('id')),
      imageUrl: '',
      monthlyListeners: 0,
      latestRelease: null,
      followedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }),
)
webRoutes.delete('/artists/:id/follow', (c) => c.json({ isFollowing: false }))
webRoutes.post('/artists/:id/seen', (c) => c.json({ ok: true }))

webRoutes.get('/artists/:id', (c) => {
  const id = decodeURIComponent(c.req.param('id'))

  return c.json({
    id,
    name: id,
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
  })
})

// ── Downloads, messages, blends, account ──────────────────────

webRoutes.get('/downloads', (c) => c.json([]))
webRoutes.get('/downloads/:id', (c) => c.json(failedBody('No download jobs in this build.'), 404))
webRoutes.post('/downloads', (c) =>
  c.json(failedBody('Offline downloads are not part of the provider backend yet.'), 400),
)
webRoutes.post('/downloads/batch', (c) => c.json([]))
webRoutes.post('/downloads/:id/cancel', (c) => c.json({ ok: true }))
webRoutes.post('/downloads/:id/retry', (c) => c.json(failedBody('No download jobs in this build.'), 404))
webRoutes.delete('/downloads/:id', (c) => c.json({ ok: true }))
webRoutes.post('/downloads/spotify', (c) =>
  c.json(failedBody('Importing a Spotify playlist needs an account and a Spotify client.'), 400),
)

webRoutes.get('/messages/conversations', (c) => c.json({ conversations: [] }))
webRoutes.get('/messages/conversations/:peerId', (c) => c.json({ messages: [] }))
webRoutes.post('/messages/conversations/:peerId', (c) => c.json({ messages: [] }))
webRoutes.get('/messages/presence', (c) => c.json({ presence: [] }))
webRoutes.post('/messages/profiles', (c) => c.json({ profiles: [] }))
webRoutes.get('/messages/users/search', (c) => c.json({ users: [] }))
webRoutes.post('/messages/send', (c) =>
  c.json(failedBody('Messaging needs accounts, and this dev bridge keeps none.'), 400),
)

webRoutes.get('/blends', (c) => c.json({ blends: [] }))
webRoutes.get('/blends/:id', (c) => c.json(failedBody('No blends in this build.'), 404))
webRoutes.post('/blends', (c) => c.json(failedBody('No blends in this build.'), 400))
webRoutes.patch('/blends/:id', (c) => c.json(failedBody('No blends in this build.'), 404))
webRoutes.delete('/blends/:id', (c) => c.json({ ok: true }))
webRoutes.post('/blends/:id/tracks', (c) => c.json(failedBody('No blends in this build.'), 404))
webRoutes.delete('/blends/:id/tracks/:trackId', (c) => c.json({ ok: true }))
webRoutes.post('/blends/:id/members', (c) => c.json(failedBody('No blends in this build.'), 404))
webRoutes.delete('/blends/:id/members/:userId', (c) => c.json({ ok: true }))

webRoutes.get('/auth/me', (c) => c.json(failedBody('No account: this bridge runs without Clerk.'), 401))
webRoutes.patch('/auth/me', (c) => c.json(failedBody('No account: this bridge runs without Clerk.'), 401))
webRoutes.get('/auth/me/preferences', (c) => c.json({ preferences: {} }))
webRoutes.get('/auth/me/preferences/defaults', (c) => c.json({ preferences: {} }))
webRoutes.put('/auth/me/preferences', (c) => c.json({ ok: true }))
webRoutes.post('/auth/logout', (c) => c.json({ ok: true }))

webRoutes.get('/settings/directories', (c) => c.json({ directories: [] }))
webRoutes.get('/settings/backup', (c) => c.json({ ok: true, backup: null }))
webRoutes.post('/settings/backup', (c) => c.json({ ok: true }))
webRoutes.post('/settings/rescan', (c) => c.json({ ok: true }))
webRoutes.post('/settings/doctor/scan', (c) => c.json({ ok: true, checks: [] }))
webRoutes.post('/settings/doctor/fix', (c) => c.json({ ok: true, fixed: [] }))

