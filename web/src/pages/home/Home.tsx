import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { TrendUp, Clock, Sparkle, Play, CaretRight, CaretDown, CaretUp, User, MusicNotes } from '@phosphor-icons/react'
import { useQueue } from '@/hooks/queue.hook'
import { usePlayerStore } from '@/store/player.store'
import { useTrackContextMenu } from '@/hooks/useTrackContextMenu'
import { usePrefetchOnIntent } from '@/hooks/prefetchIntent.hook'
import { tracksApi } from '@/api/tracks.api'
import { analyticsApi } from '@/api/analytics.api'
import { searchApi } from '@/api/search.api'
import { recommendationsApi, type DailyMix } from '@/api/recommendations.api'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Track } from '@/types/track.types'

// ── Helpers ───────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

// Filters junk/placeholder rows that normalization can't always remove
// (e.g. offline fallback entries that were never fully cached).
function isRealTrack(t: Track | undefined | null): t is Track {
  return !!t && !!t.id && !t.id.startsWith('unknown-') && !!t.title && t.title !== 'Unknown Track'
}

// ── Section header ────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle, onSeeAll, onSeeAllLabel }: {
  icon:      React.ElementType
  title:     string
  subtitle?: string
  onSeeAll?: () => void
  onSeeAllLabel?: string
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-[var(--accent)]" />
        </div>
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)] leading-none">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {onSeeAll && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onSeeAll}
          className="flex items-center gap-0.5 text-xs font-semibold text-[var(--text-muted)] active:text-[var(--accent)] transition-colors px-2 py-1"
        >
          {onSeeAllLabel ?? 'See all'}
          <CaretRight className="w-3.5 h-3.5" />
        </motion.button>
      )}
    </div>
  )
}

// ── Last played — a plain list ────────────────────────────────

function TrackListRow({
  track,
  index,
  active,
  isPlaying,
  onPlay,
}: {
  track: Track
  index: number
  active: boolean
  isPlaying: boolean
  onPlay: () => void
}) {
  const contextMenu = useTrackContextMenu(track)
  const intent = usePrefetchOnIntent(track.id)
  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.2) }}
      whileTap={{ scale: 0.98 }}
      onClick={onPlay}
      {...contextMenu}
      {...intent}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left',
        active ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--bg-elevated)]',
      )}
    >
      <div className="relative flex-shrink-0">
        {track.artworkUrl
          ? <img src={track.artworkUrl} alt={track.title} className="w-11 h-11 rounded-xl object-cover" />
          : <div className="w-11 h-11 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center"><MusicNotes className="w-4 h-4 text-[var(--text-muted)]" /></div>
        }
        {active && isPlaying && (
          <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
            <div className="flex gap-[2px] items-end h-3">
              {[0, 1, 2].map((j) => (
                <motion.div
                  key={j}
                  className="w-[2px] bg-white rounded-full"
                  animate={{ height: ['40%', '100%', '60%'] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: j * 0.15 }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-semibold truncate',
          active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]',
        )}>
          {track.title}
        </p>
        <p className="text-xs text-[var(--text-secondary)] truncate">
          {track.artist?.name ?? 'Unknown Artist'}
        </p>
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">
        {formatDuration(track.duration)}
      </span>
    </motion.button>
  )
}

// ── Recommended artists — circles derived from real listening ──

interface RecArtist {
  name: string
  id: string | null // null = couldn't resolve to an artist page; tap opens search
}

// Resolves a list of artist names (from the listening profile) to real
// artist entities via search, so each chip routes to the artist page.
function useResolvedArtists(names: string[] | undefined, max = 6) {
  const key = (names ?? []).slice(0, max).join('|')
  const [artists, setArtists] = useState<RecArtist[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!key) {
      setArtists([])
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.all(
      key.split('|').map(async (name): Promise<RecArtist | null> => {
        try {
          const results = await searchApi.search(name, 'artists')
          const found = results.artists[0]
          return { name, id: found?.id ?? null }
        } catch {
          return { name, id: null }
        }
      }),
    ).then((results) => {
      if (!cancelled) {
        setArtists(results.filter((a): a is RecArtist => a !== null))
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [key])

  return { artists, loading }
}

function ArtistCircle({
  artist,
  index,
  onOpen,
}: {
  artist: RecArtist
  index: number
  onOpen: (artist: RecArtist) => void
}) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.04 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => onOpen(artist)}
      className="flex-shrink-0 w-20 text-left group"
    >
      <div className="w-20 h-20 rounded-full overflow-hidden mb-2 bg-[var(--bg-surface)] border border-[var(--border)] group-hover:border-[var(--border-strong)] transition-colors flex items-center justify-center">
        <User className="w-7 h-7 text-[var(--text-muted)]" />
      </div>
      <p className="text-xs font-semibold text-[var(--text-primary)] truncate text-center">
        {artist.name}
      </p>
    </motion.button>
  )
}

function RecommendedArtists({ names, loadingNames }: {
  names: string[] | undefined
  loadingNames: boolean
}) {
  const navigate = useNavigate()
  const { artists, loading } = useResolvedArtists(names)
  const show = loadingNames || loading || artists.length > 0
  if (!show) return null

  const open = (artist: RecArtist) => {
    if (artist.id) navigate(`/artist/${encodeURIComponent(artist.id)}`)
    else navigate(`/search?q=${encodeURIComponent(artist.name)}`)
  }

  return (
    <section>
      <SectionHeader
        icon={User}
        title="Recommended artists"
        subtitle="Based on your listening"
      />
      {loadingNames || loading ? (
        <div className="flex gap-5 -mx-4 px-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-20">
              <Skeleton className="w-20 h-20 rounded-full mb-2" />
              <Skeleton className="h-3 w-16 mx-auto rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
          {artists.map((artist, i) => (
            <ArtistCircle key={artist.name} artist={artist} index={i} onOpen={open} />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Trending this week — 5, expandable to 10 ──────────────────

function TrendingSection({ tracks, loading }: { tracks: Track[]; loading: boolean }) {
  const navigate = useNavigate()
  const { playTrack } = useQueue()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const [expanded, setExpanded] = useState(false)

  const visible = expanded ? tracks.slice(0, 10) : tracks.slice(0, 5)
  const canExpand = tracks.length > 5

  if (!loading && tracks.length === 0) return null

  return (
    <section>
      <SectionHeader
        icon={TrendUp}
        title="Trending this week"
        subtitle="The weekly chart"
        onSeeAll={tracks.length > 0 ? () => navigate('/trending') : undefined}
      />
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {visible.map((track, i) => (
              <TrackListRow
                key={track.id}
                track={track}
                index={i}
                active={currentTrack?.id === track.id}
                isPlaying={isPlaying}
                onPlay={() => playTrack(track, visible)}
              />
            ))}
          </div>
          {canExpand && (
            <button
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="w-full flex items-center justify-center gap-1.5 mt-3 py-2.5 rounded-2xl text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] active:text-[var(--accent)] transition-colors"
            >
              {expanded ? 'Show less' : `See all ${Math.min(tracks.length, 10)} songs`}
              {expanded
                ? <CaretUp className="w-3.5 h-3.5" />
                : <CaretDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </>
      )}
    </section>
  )
}

// ── Made for you — playlist grid cards ────────────────────────

function PlaylistCard({
  title,
  subtitle,
  artworkUrl,
  index,
  onOpen,
}: {
  title: string
  subtitle: string
  artworkUrl?: string
  index: number
  onOpen: () => void
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.25) }}
      whileTap={{ scale: 0.97 }}
      onClick={onOpen}
      className="text-left group"
    >
      <div className="relative aspect-square rounded-2xl overflow-hidden mb-2 shadow-lg bg-[var(--bg-surface)] border border-[var(--border)]">
        {artworkUrl
          ? <img src={artworkUrl} alt={title} className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-[var(--bg-overlay)] flex items-center justify-center"><MusicNotes className="w-8 h-8 text-[var(--text-muted)]" /></div>
        }
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-lg ml-auto">
            <Play className="w-4 h-4 text-black fill-current ml-0.5" />
          </div>
        </div>
      </div>
      <p className="text-sm font-bold text-[var(--text-primary)] truncate">{title}</p>
      <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{subtitle}</p>
    </motion.button>
  )
}

function MadeForYou({ mixes, loadingMixes }: {
  mixes: DailyMix[]
  loadingMixes: boolean
}) {
  const { playAll } = useQueue()

  if (!loadingMixes && mixes.length === 0) return null

  return (
    <section>
      <SectionHeader
        icon={Sparkle}
        title="Made for you"
        subtitle="Mixes tuned to your taste"
      />
      {loadingMixes ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="aspect-square rounded-2xl mb-2" />
              <Skeleton className="h-3.5 w-3/4 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {mixes.map((mix, i) => (
            <PlaylistCard
              key={mix.id}
              title={mix.title}
              subtitle={mix.subtitle}
              artworkUrl={mix.artworkUrl}
              index={i}
              onOpen={() => playAll(mix.tracks, { shuffle: true })}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Empty state ───────────────────────────────────────────────

function EmptyHome() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-5">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        className="w-24 h-24 rounded-[2rem] bg-[var(--accent-subtle)] border border-[var(--accent-border)] flex items-center justify-center"
      >
        <Sparkle className="w-10 h-10 text-[var(--accent)]" />
      </motion.div>
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Your music starts here</h2>
        <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
          Search for songs, paste a Spotify or YouTube link, or browse your library to get started.
        </p>
      </div>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => navigate('/search')}
        className="px-6 py-3 rounded-2xl bg-[var(--accent)] text-white font-bold text-sm shadow-lg"
      >
        Search music
      </motion.button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate()

  const { data: recentRaw, isLoading: loadingRecent } = useQuery({
    queryKey:  ['recently-played'],
    queryFn:   () => tracksApi.getRecentlyPlayed(16),
    staleTime: 30_000,
    retry:     1,
  })

  // Weekly charts (cached server-side per ISO week) — the trending section.
  const { data: trendingRaw, isLoading: loadingTrending } = useQuery({
    queryKey:  ['trending', 'weekly'],
    queryFn:   () => tracksApi.getWeeklyTrending(10),
    staleTime: 30 * 60_000,
    retry:     1,
  })

  // Artist names from real listening behaviour (30-day window).
  const { data: topArtists, isLoading: loadingTopArtists } = useQuery({
    queryKey:  ['top-artists', 'home'],
    queryFn:   () => analyticsApi.getTopArtists(30, 6),
    staleTime: 10 * 60_000,
    retry:     1,
  })

  // Daily Mixes — one playlist per top genre, from the taste profile.
  const { data: mixesRaw, isLoading: loadingMixes } = useQuery({
    queryKey:  ['daily-mixes'],
    queryFn:   () => recommendationsApi.getMixes(),
    staleTime: 30 * 60_000,
    retry:     1,
  })

  const recent   = (recentRaw ?? []).filter(isRealTrack)
  const trending = (trendingRaw ?? []).filter(isRealTrack)
  const mixes    = (mixesRaw ?? []).filter((m) => m.tracks.length > 0)

  const hasRecent   = recent.length > 0
  const hasAnything = hasRecent || trending.length > 0 || mixes.length > 0
  const allDone     = !loadingRecent && !loadingTrending && !loadingMixes && !loadingTopArtists

  return (
    <ScrollArea className="h-full">
      <div className="px-4 lg:px-8 pt-6 pb-10 space-y-8 lg:max-w-6xl lg:mx-auto">

        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{greeting()}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">What do you want to hear?</p>
        </motion.div>

        {allDone && !hasAnything && <EmptyHome />}

        {(loadingRecent || hasRecent) && (
          <section>
            <SectionHeader
              icon={Clock}
              title="Last played"
              subtitle="Pick up where you left off"
              onSeeAll={hasRecent ? () => navigate('/recently-played') : undefined}
            />
            {loadingRecent ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-2xl" />
                ))}
              </div>
            ) : (
              <LastPlayedList tracks={recent} />
            )}
          </section>
        )}

        <RecommendedArtists
          names={topArtists?.artists.map((a) => a.artist)}
          loadingNames={loadingTopArtists}
        />

        <TrendingSection tracks={trending} loading={loadingTrending} />

        <MadeForYou mixes={mixes} loadingMixes={loadingMixes} />

      </div>
    </ScrollArea>
  )
}

function LastPlayedList({ tracks }: { tracks: Track[] }) {
  const { playTrack } = useQueue()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  return (
    <div className="space-y-1">
      {tracks.slice(0, 6).map((track, i) => (
        <TrackListRow
          key={track.id}
          track={track}
          index={i}
          active={currentTrack?.id === track.id}
          isPlaying={isPlaying}
          onPlay={() => playTrack(track, tracks)}
        />
      ))}
    </div>
  )
}
