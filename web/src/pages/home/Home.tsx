import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useQueue } from '@/hooks/useQueue'
import { tracksApi } from '@/api/tracks'
import { getFeatured } from '@/api/library'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Skeleton } from '@/components/ui/Skeleton'
import { QuickPicks, FeaturedSection, TrendingRow } from './components/HomeSections'

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">{title}</h2>
  )
}

function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 rounded-2xl" />
      ))}
    </div>
  )
}

export default function Home() {
  const { playTrack } = useQueue()

  const { data: recentTracks,  isLoading: loadingRecent   } = useQuery({
    queryKey: ['recently-played'],
    queryFn:  () => tracksApi.getRecentlyPlayed,
  })
  const { data: featuredItems, isLoading: loadingFeatured } = useQuery({
    queryKey: ['featured'],
    queryFn:  getFeatured,
  })
  const { data: trendingTracks, isLoading: loadingTrending } = useQuery({
    queryKey: ['trending'],
    queryFn: () => tracksApi.getTrending,
  })

  // Greeting based on time of day
  const hour     = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning'
    : hour < 18 ? 'Good afternoon'
    : 'Good evening'

  return (
    <ScrollArea className="h-full">
      <div className="px-4 lg:px-8 pt-8 pb-8 space-y-8">

        {/* ── Greeting ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{greeting}</h1>
        </motion.div>

        {/* ── Quick picks (recently played) ─────────────────── */}
        {(loadingRecent || (recentTracks?.length ?? 0) > 0) && (
          <section>
            <SectionHeader title="Quick picks" />
            {loadingRecent
              ? <SectionSkeleton rows={6} />
              : recentTracks && (
                <QuickPicks
                  tracks={recentTracks.slice(0, 8)}
                  onPlay={(track, queue) => playTrack(track, queue)}
                />
              )
            }
          </section>
        )}

        {/* ── Featured ──────────────────────────────────────── */}
        {(loadingFeatured || (featuredItems?.length ?? 0) > 0) && (
          <section>
            <SectionHeader title="Featured" />
            {loadingFeatured
              ? (
                <div className="flex gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="w-44 h-52 rounded-3xl flex-shrink-0" />
                  ))}
                </div>
              ) : featuredItems && (
                <FeaturedSection items={featuredItems} />
              )
            }
          </section>
        )}

        {/* ── Trending ──────────────────────────────────────── */}
        {(loadingTrending || (trendingTracks?.length ?? 0) > 0) && (
          <section>
            <SectionHeader title="Trending" />
            {loadingTrending
              ? <SectionSkeleton rows={5} />
              : trendingTracks && (
                <TrendingRow
                  tracks={trendingTracks.slice(0, 10)}
                  onPlay={(track, queue) => playTrack(track, queue)}
                />
              )
            }
          </section>
        )}
      </div>
    </ScrollArea>
  )
}
