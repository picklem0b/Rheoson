import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  Clock,
  Sparkles,
  Play,
  ChevronRight,
  Heart,
  Compass,
  Music2,
} from 'lucide-react'
import { useQueue } from '@/hooks/queue.hook'
import { usePlayerStore } from '@/store/player.store'
import { tracksApi } from '@/api/tracks.api'
import { libraryApi } from '@/api/library.api'
import { recommendationsApi, type RecommendationSection } from '@/api/recommendations.api'
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

// Filters out junk/placeholder records (e.g. Swagger "string" test entries
// with no real title or zero tracks) so they never reach the UI.
function isRealFeaturedItem(item: { title?: string; subtitle?: string }): boolean {
  const title = (item.title ?? '').trim().toLowerCase()
  if (!title || title === 'string') return false
  return true
}

// ── Section header ────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle, onSeeAll }: {
  icon:      React.ElementType
  title:     string
  subtitle?: string
  onSeeAll?: () => void
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
          See all
          <ChevronRight className="w-3.5 h-3.5" />
        </motion.button>
      )}
    </div>
  )
}

// ── Quick picks — 2-col grid ──────────────────────────────────

function QuickPicks({ tracks }: { tracks: Track[] }) {
  const { playTrack }  = useQueue()
  const currentTrack   = usePlayerStore((s) => s.currentTrack)
  const isPlaying      = usePlayerStore((s) => s.isPlaying)

  return (
    <div className="grid grid-cols-2 gap-2">
      {tracks.slice(0, 8).map((track, i) => {
        const active = currentTrack?.id === track.id
        return (
          <motion.button
            key={track.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => playTrack(track, tracks)}
            className={cn(
              'group flex items-center gap-0 rounded-2xl overflow-hidden text-left transition-colors',
              active
                ? 'bg-[var(--accent-subtle)] border border-[var(--accent-border)]'
                : 'bg-[var(--bg-surface)] border border-[var(--border)] hover:bg-[var(--bg-elevated)]',
            )}
          >
            <div className="relative flex-shrink-0 w-14 h-14">
              {track.artworkUrl
                ? <img src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-[var(--bg-elevated)]" />
              }
              {active && isPlaying && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
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
            <div className="flex-1 min-w-0 px-2.5">
              <p className={cn(
                'text-xs font-bold truncate leading-tight',
                active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]',
              )}>
                {track.title}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                {track.artist?.name ?? 'Unknown Artist'}
              </p>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}

// ── Featured carousel ─────────────────────────────────────────

const GRADIENTS = [
  'from-violet-900 to-purple-700',
  'from-rose-900 to-pink-700',
  'from-cyan-900 to-blue-700',
  'from-amber-900 to-orange-700',
  'from-emerald-900 to-green-700',
]

function FeaturedCarousel({ items }: {
  items: { id: string; title: string; subtitle?: string; artworkUrl?: string; type: 'playlist' | 'album' }[]
}) {
  const navigate = useNavigate()
  return (
    <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
      {items.map((item, i) => (
        <motion.button
          key={item.id}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.05 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate(`/${item.type}/${item.id}`)}
          className="flex-shrink-0 w-44 text-left group"
        >
          <div className="relative w-44 h-44 rounded-3xl overflow-hidden mb-2.5 shadow-lg">
            {item.artworkUrl
              ? <img src={item.artworkUrl} alt={item.title} className="w-full h-full object-cover" />
              : <div className={cn('w-full h-full bg-gradient-to-br', GRADIENTS[i % GRADIENTS.length])} />
            }
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
              <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-lg ml-auto">
                <Play className="w-4 h-4 text-black fill-current ml-0.5" />
              </div>
            </div>
          </div>
          <p className="text-sm font-bold text-[var(--text-primary)] truncate">{item.title}</p>
          {item.subtitle && (
            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{item.subtitle}</p>
          )}
        </motion.button>
      ))}
    </div>
  )
}

// ── Trending list ─────────────────────────────────────────────

function TrendingList({ tracks }: { tracks: Track[] }) {
  const { playTrack }  = useQueue()
  const currentTrack   = usePlayerStore((s) => s.currentTrack)
  const isPlaying      = usePlayerStore((s) => s.isPlaying)

  return (
    <div className="space-y-1">
      {tracks.slice(0, 10).map((track, i) => {
        const active = currentTrack?.id === track.id
        return (
          <motion.button
            key={track.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => playTrack(track, tracks)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left',
              active ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--bg-elevated)]',
            )}
          >
            <span className={cn(
              'text-sm tabular-nums w-5 text-center font-bold flex-shrink-0',
              active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
            )}>
              {i + 1}
            </span>
            <div className="relative flex-shrink-0">
              {track.artworkUrl
                ? <img src={track.artworkUrl} alt={track.title} className="w-11 h-11 rounded-xl object-cover" />
                : <div className="w-11 h-11 rounded-xl bg-[var(--bg-elevated)]" />
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
              <p className="text-xs text-[var(--text-secondary)] truncate">{track.artist?.name ?? 'Unknown Artist'}</p>
            </div>
            <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">
              {formatDuration(track.duration)}
            </span>
          </motion.button>
        )
      })}
    </div>
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
        <Sparkles className="w-10 h-10 text-[var(--accent)]" />
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

// ── Hydrated recommendation sections ─────────────────────────

function useHydratedTracks(ids: string[] | undefined, max = 10) {
  const key = (ids ?? []).slice(0, max).join('|')
  const [state, setState] = useState<{ loading: boolean; tracks: Track[] }>({
    loading: false,
    tracks:  [],
  })

  useEffect(() => {
    if (!key) {
      setState({ loading: false, tracks: [] })
      return
    }
    let cancelled = false
    setState((s) => ({ loading: true, tracks: s.tracks }))
    Promise.all(
      key
        .split('|')
        .map((id) => tracksApi.getTrack(id).catch(() => null))
    ).then((results) => {
      if (!cancelled) {
        setState({
          loading: false,
          tracks:  results.filter((t): t is Track => t !== null),
        })
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}

// ── Page ──────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, React.ElementType> = {
  for_you:          Sparkles,
  recent_favorites: Heart,
  discover:         Compass,
  trending:         TrendingUp,
}

const SECTION_SUBTITLES: Record<string, string> = {
  for_you:          'Based on your listening',
  recent_favorites: 'Songs you loved',
  discover:         'Something new',
}

// Filters junk/placeholder rows that normalization can't always remove
// (e.g. offline fallback entries that were never fully cached).
function isRealTrack(t: Track | undefined | null): t is Track {
  return !!t && !!t.id && !t.id.startsWith('unknown-') && !!t.title && t.title !== 'Unknown Track'
}

export default function Home() {
  const navigate = useNavigate()

  const { data: recentRaw, isLoading: loadingRecent } = useQuery({
    queryKey:  ['recently-played'],
    queryFn:   () => tracksApi.getRecentlyPlayed(16),
    staleTime: 30_000,
    retry:     1,
  })

  const { data: recs, isLoading: loadingRecs } = useQuery({
    queryKey:  ['recommendations', 'home'],
    queryFn:   () => recommendationsApi.getHome(),
    staleTime: 5 * 60_000,
    retry:     1,
  })

  const { data: trendingRaw, isLoading: loadingTrending } = useQuery({
    queryKey:  ['trending'],
    queryFn:   () => tracksApi.getTrending(20),
    staleTime: 5 * 60_000,
    retry:     1,
  })

  const { data: featuredRaw, isLoading: loadingFeatured } = useQuery({
    queryKey:  ['featured'],
    queryFn:   () => libraryApi.getFeatured(10),
    staleTime: 5 * 60_000,
    retry:     0,
  })

  // Strip junk before it reaches the UI
  const recent   = (recentRaw ?? []).filter(isRealTrack)
  const trending = (trendingRaw ?? []).filter(isRealTrack)
  const featured = (featuredRaw ?? []).filter(isRealFeaturedItem)

  const hasRecent   = recent.length > 0
  const hasTrending = trending.length > 0
  const hasFeatured = featured.length > 0
  const allDone     = !loadingRecent && !loadingTrending && !loadingFeatured && !loadingRecs
  const hasAnything = hasRecent || hasTrending || hasFeatured

  // Every section the recommendation engine returned, in order. The
  // standalone trending rail covers section_id 'trending' below (full
  // hydrated tracks from the API), so we skip its id-only duplicate.
  const recSections = (recs?.sections ?? []).filter(
    (s: RecommendationSection) => s.section_id !== 'trending' && s.track_ids.length > 0
  )

  // Standalone trending is preferred; if it came back empty, fall back
  // to the engine's trending section ids (same source, different moment).
  const recTrendingIds = (recs?.sections ?? []).find(
    (s: RecommendationSection) => s.section_id === 'trending'
  )?.track_ids
  const trendingFallback = useHydratedTracks(
    hasTrending || !recTrendingIds?.length ? undefined : recTrendingIds,
    10
  )
  const trendingTracks = hasTrending ? trending : trendingFallback.tracks
  const showTrending =
    loadingTrending || trendingTracks.length > 0 || trendingFallback.loading

  return (
    <ScrollArea className="h-full">
      <div className="px-4 lg:px-8 pt-6 pb-10 space-y-8">

        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{greeting()}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">What do you want to hear?</p>
        </motion.div>

        {allDone && !hasAnything && recSections.length === 0 && <EmptyHome />}

        {(loadingRecent || hasRecent) && (
          <section>
            <SectionHeader
              icon={Clock}
              title="Quick picks"
              subtitle="Recently played"
              onSeeAll={hasRecent ? () => navigate('/recently-played') : undefined}
            />
            {loadingRecent
              ? <div className="grid grid-cols-2 gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
              : <QuickPicks tracks={recent} />
            }
          </section>
        )}

        {(loadingFeatured || hasFeatured) && (
          <section>
            <SectionHeader
              icon={Sparkles}
              title="Featured"
              subtitle="From your library"
              onSeeAll={hasFeatured ? () => navigate('/featured') : undefined}
            />
            {loadingFeatured
              ? <div className="flex gap-4 -mx-4 px-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="w-44 h-44 rounded-3xl flex-shrink-0" />)}</div>
              : <FeaturedCarousel items={featured} />
            }
          </section>
        )}

        {/* Personalized recommendation rails — every section the engine
            returned renders here (not just "for you"), so the page always
            reflects whatever signals exist. */}
        {!loadingRecs && recSections.length > 0 && (
          <div className="space-y-8">
            {recSections.slice(0, 4).map((section) => (
              <SectionRail key={section.section_id} section={section} />
            ))}
          </div>
        )}

        {showTrending && (
          <section>
            <SectionHeader
              icon={TrendingUp}
              title="Trending"
              subtitle="Popular right now"
              onSeeAll={
                trendingTracks.length > 0 ? () => navigate('/trending') : undefined
              }
            />
            {loadingTrending || trendingFallback.loading
              ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
              : <TrendingList tracks={trendingTracks} />
            }
          </section>
        )}

      </div>
    </ScrollArea>
  )
}

// Renders one personalized recommendation rail: hydrates its track ids
// in parallel and skips itself entirely if nothing resolves.
function SectionRail({ section }: { section: RecommendationSection }) {
  const { playTrack }  = useQueue()
  const currentTrack   = usePlayerStore((s) => s.currentTrack)
  const isPlaying      = usePlayerStore((s) => s.isPlaying)
  const { loading, tracks } = useHydratedTracks(section.track_ids, 10)

  const Icon = SECTION_ICONS[section.section_id] ?? Music2

  if (loading) {
    return (
      <section>
        <SectionHeader icon={Icon} title={section.title} />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </div>
      </section>
    )
  }

  if (!tracks.length) return null

  return (
    <section>
      <SectionHeader
        icon={Icon}
        title={section.title}
        subtitle={SECTION_SUBTITLES[section.section_id]}
      />
      <div className="space-y-1">
        {tracks.map((track, i) => {
          const active = currentTrack?.id === track.id
          return (
            <motion.button
              key={track.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => playTrack(track, tracks)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left',
                active ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--bg-elevated)]',
              )}
            >
              <div className="relative flex-shrink-0">
                {track.artworkUrl
                  ? <img src={track.artworkUrl} alt={track.title} className="w-11 h-11 rounded-xl object-cover" />
                  : <div className="w-11 h-11 rounded-xl bg-[var(--bg-elevated)]" />
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
        })}
      </div>
    </section>
  )
}