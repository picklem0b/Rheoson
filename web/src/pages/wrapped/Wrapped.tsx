import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  Award, Flame, Headphones, PlayCircle, Sparkles, TrendingUp,
} from 'lucide-react'
import { analyticsApi, type WrappedReport } from '@/api/analytics.api'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCount } from '@/lib/formatters'
import { cn } from '@/lib/utils'

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// ── Small pieces ─────────────────────────────────────────────

function RankedRow({ rank, title, subtitle, plays, maxPlays, imageText }: {
  rank: number
  title: string
  subtitle?: string
  plays: number
  maxPlays: number
  imageText?: string
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-[var(--bg-elevated)] transition-colors">
      <span className="text-sm font-black text-[var(--text-muted)] w-6 text-center tabular-nums">
        {rank}
      </span>
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--accent)]/30 to-transparent border border-[var(--border)] flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-black text-[var(--accent)]">{imageText ?? ''}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--text-primary)] truncate">{title}</p>
        {subtitle && <p className="text-xs text-[var(--text-muted)] truncate">{subtitle}</p>}
        <div className="h-1 rounded-full bg-[var(--border)] mt-1.5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${maxPlays > 0 ? (plays / maxPlays) * 100 : 0}%` }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="h-full bg-gradient-to-r from-[var(--accent)] to-fuchsia-400"
          />
        </div>
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">
        {plays} plays
      </span>
    </div>
  )
}

function MonthChart({ months }: { months: { month: number; plays: number }[] }) {
  const byMonth = new Map<number, number>()
  for (const m of months) byMonth.set(m.month, m.plays)
  const max = Math.max(...byMonth.values(), 1)
  return (
    <div className="flex items-end gap-1 h-24 px-1">
      {MONTH_NAMES.map((name, i) => {
        const value = byMonth.get(i + 1) ?? 0
        const height = max > 0 ? (value / max) * 100 : 0
        const active = value > 0
        return (
          <div key={name} className="flex-1 flex flex-col items-center gap-1">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: active ? `${Math.max(4, height)}%` : '4%' }}
              transition={{ delay: i * 0.02, type: 'spring', damping: 20 }}
              className={cn(
                'w-full rounded-t-sm',
                active ? 'bg-gradient-to-t from-[var(--accent)] to-fuchsia-400' : 'bg-[var(--border)] opacity-40'
              )}
            />
            <span className="text-[8px] text-[var(--text-muted)]">{name}</span>
          </div>
        )
      })}
    </div>
  )
}

function HeroStat({ icon: Icon, label, value }: {
  icon: React.ElementType
  label: string
  value: string | number
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-white/10 border border-white/15 px-2 py-3 backdrop-blur-sm">
      <Icon className="w-4 h-4 text-white" />
      <p className="text-lg font-black text-white tabular-nums leading-none">{value}</p>
      <p className="text-[10px] text-white/70 font-medium">{label}</p>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function Wrapped() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'wrapped', year],
    queryFn: () => analyticsApi.getWrapped(year),
    staleTime: 30 * 60_000,
    retry: 1,
  })

  const report = useMemo(() => {
    if (!data) return null
    const d = data as Partial<WrappedReport>
    return {
      year: d.year ?? year,
      top_artists: Array.isArray(d.top_artists) ? d.top_artists : [],
      top_tracks: Array.isArray(d.top_tracks) ? d.top_tracks : [],
      total_plays: Number(d.total_plays ?? 0),
      total_minutes: Number(d.total_minutes ?? 0),
      months: Array.isArray(d.months) ? d.months : [],
      genres: Array.isArray(d.genres) ? d.genres : [],
      streaks: {
        current_streak: Number(d.streaks?.current_streak ?? 0),
        longest_streak: Number(d.streaks?.longest_streak ?? 0),
      },
      top_decade: d.top_decade ?? null,
    } as WrappedReport
  }, [data, year])
  const maxArtist = report?.top_artists[0]?.plays ?? 1
  const maxTrack = report?.top_tracks[0]?.plays ?? 1
  const maxGenre = report?.genres[0]?.plays ?? 1
  const empty = report && report.total_plays === 0 && report.top_artists.length === 0
  const hours = report ? Math.max(1, Math.round(report.total_minutes / 60)) : 0
  const topArtistName = report?.top_artists[0]?.artist

  return (
    <ScrollArea className="h-full">
      <div className="px-4 lg:px-8 pt-6 pb-14 max-w-3xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[var(--accent)]" />
              Your Wrapped
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">Your listening year in review</p>
          </div>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-9 px-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-sm font-semibold text-[var(--text-primary)] outline-none"
            aria-label="Select year"
          >
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </motion.div>

        {isLoading && !report ? (
          <div className="space-y-4">
            <Skeleton className="h-40 rounded-[24px]" />
            <Skeleton className="h-56 rounded-[24px]" />
            <Skeleton className="h-40 rounded-[24px]" />
          </div>
        ) : report && empty ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16 px-6"
          >
            <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-br from-[var(--accent)] to-fuchsia-500 flex items-center justify-center mb-4">
              <Headphones className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-black text-[var(--text-primary)]">Nothing to wrap up yet</h2>
            <p className="text-sm text-[var(--text-muted)] mt-2 max-w-sm mx-auto leading-relaxed">
              Play more music in {year} and come back — your top artists, tracks,
              and listening moments will appear here.
            </p>
          </motion.div>
        ) : report ? (
          <div className="space-y-5">
            {/* Hero card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-[24px] p-6 text-white bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 shadow-xl"
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">Your {report.year}</p>
              <h2 className="text-3xl font-black mt-1 leading-tight">
                {report.total_plays > 0
                  ? `You played ${formatCount(report.total_plays)} songs${topArtistName ? ` and ${topArtistName} got you through it` : ''}`
                  : `Your year in music`}
              </h2>
              <div className="grid grid-cols-4 gap-2 mt-6">
                <HeroStat icon={PlayCircle} label="Plays" value={formatCount(report.total_plays)} />
                <HeroStat icon={Headphones} label="Hours" value={hours} />
                <HeroStat icon={Flame} label="Best streak" value={report.streaks.longest_streak} />
                <HeroStat icon={Award} label="Top artist" value={topArtistName ? topArtistName.slice(0, 8) : '—'} />
              </div>
            </motion.div>

            {/* Top artists */}
            {report.top_artists.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[var(--accent)]" />
                  Top artists
                </h2>
                <div className="space-y-1">
                  {report.top_artists.map((a, i) => (
                    <RankedRow
                      key={a.artist}
                      rank={i + 1}
                      title={a.artist}
                      plays={a.plays}
                      maxPlays={maxArtist}
                      imageText={a.artist.slice(0, 2).toUpperCase()}
                    />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Top tracks */}
            {report.top_tracks.some((t) => t.title) && (
              <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <PlayCircle className="w-4 h-4 text-[var(--accent)]" />
                  Top tracks
                </h2>
                <div className="space-y-1">
                  {report.top_tracks.filter((t) => t.title).map((t, i) => (
                    <RankedRow
                      key={`${t.track_id}-${i}`}
                      rank={i + 1}
                      title={t.title}
                      subtitle={t.artist}
                      plays={t.plays}
                      maxPlays={maxTrack}
                    />
                  ))}
                </div>
              </motion.section>
            )}

            {/* Genres */}
            {report.genres.length > 0 && (
              <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <Award className="w-4 h-4 text-[var(--accent)]" />
                  Your genres
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {report.genres.map((g) => (
                    <div key={g.genre} className="p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">{g.genre}</p>
                        <span className="text-[10px] text-[var(--text-muted)] tabular-nums">{g.plays}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-rose-400"
                          style={{ width: `${maxGenre > 0 ? (g.plays / maxGenre) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Monthly activity */}
            {report.months.some((m) => m.plays > 0) && (
              <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                  Listening through the year
                </h2>
                <div className="p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                  <MonthChart months={report.months} />
                </div>
              </motion.section>
            )}
          </div>
        ) : null}
      </div>
    </ScrollArea>
  )
}
