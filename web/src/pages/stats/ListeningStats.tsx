import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  BarChart3, Clock, Heart, Users, Music2, TrendingUp, Calendar
} from 'lucide-react'
import { analyticsApi } from '@/api/analytics.api'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCount } from '@/lib/formatters'
import { cn } from '@/lib/utils'

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', color || 'bg-[var(--accent-subtle)]')}>
        <Icon className="w-4 h-4 text-[var(--accent)]" />
      </div>
      <div>
        <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
        <p className="text-[10px] text-[var(--text-muted)] font-medium">{label}</p>
      </div>
    </div>
  )
}

function BarChart({ data, maxValue }: { data: { label: string; value: number }[]; maxValue: number }) {
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => {
        const height = maxValue > 0 ? (d.value / maxValue) * 100 : 0
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(2, height)}%` }}
              transition={{ delay: i * 0.03, type: 'spring', damping: 20 }}
              className="w-full rounded-t-sm bg-[var(--accent)]"
              style={{ opacity: 0.3 + (height / 100) * 0.7 }}
            />
            <span className="text-[8px] text-[var(--text-muted)]">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function ListeningStats() {
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['analytics', 'stats'],
    queryFn: analyticsApi.getStats,
    staleTime: 60_000,
  })

  const { data: topArtists } = useQuery({
    queryKey: ['analytics', 'top-artists'],
    queryFn: () => analyticsApi.getTopArtists(30, 5),
    staleTime: 60_000,
  })

  const { data: hourlyData } = useQuery({
    queryKey: ['analytics', 'hourly'],
    queryFn: () => analyticsApi.getListeningByHour(30),
    staleTime: 60_000,
  })

  const { data: dailyData } = useQuery({
    queryKey: ['analytics', 'daily'],
    queryFn: () => analyticsApi.getListeningByDay(7),
    staleTime: 60_000,
  })

  const hourly = hourlyData?.hours ?? []
  const maxHourly = Math.max(...hourly.map(h => h.plays), 1)
  const hourlyChart = hourly.map(h => ({
    label: h.hour % 6 === 0 ? `${h.hour}` : '',
    value: h.plays,
  }))

  const daily = dailyData?.days ?? []
  const maxDaily = Math.max(...daily.map(d => d.plays), 1)
  const dailyChart = daily.map(d => ({
    label: d.day,
    value: d.plays,
  }))

  return (
    <ScrollArea className="h-full">
      <div className="px-4 lg:px-8 pt-6 pb-10 space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Your Stats</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Listening insights and trends</p>
        </motion.div>

        {/* Stats grid */}
        {loadingStats ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Music2} label="Total plays" value={formatCount(stats.total_plays)} />
            <StatCard icon={Clock} label="Listening time" value={`${stats.estimated_listening_hours}h`} />
            <StatCard icon={Heart} label="Liked tracks" value={stats.total_likes} />
            <StatCard icon={Users} label="Artists played" value={stats.unique_artists_30d} />
            <StatCard icon={Calendar} label="Active days" value={stats.active_days_30d} />
            <StatCard icon={TrendingUp} label="Plays (7d)" value={stats.plays_7d} />
          </div>
        ) : null}

        {/* Listening by hour chart */}
        {hourly.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--accent)]" />
              Listening by hour
            </h2>
            <div className="p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]">
              <BarChart data={hourlyChart} maxValue={maxHourly} />
            </div>
          </motion.section>
        )}

        {/* Listening by day chart */}
        {daily.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent)]" />
              Listening by day
            </h2>
            <div className="p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]">
              <BarChart data={dailyChart} maxValue={maxDaily} />
            </div>
          </motion.section>
        )}

        {/* Top artists */}
        {topArtists && topArtists.artists.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
              Top artists (30 days)
            </h2>
            <div className="space-y-1">
              {topArtists.artists.map((a, i) => (
                <div
                  key={a.artist}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  <span className="text-sm font-bold text-[var(--text-muted)] w-5 text-center tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)] flex-1 truncate">
                    {a.artist}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] tabular-nums">
                    {a.plays} plays
                  </span>
                </div>
              ))}
            </div>
          </motion.section>
        )}
      </div>
    </ScrollArea>
  )
}
