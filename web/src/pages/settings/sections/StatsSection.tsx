import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  BarChart3, Clock, Heart, Users, Music2, TrendingUp, Calendar,
  Sparkles, Play, RefreshCw
} from 'lucide-react'
import { analyticsApi } from '@/api/analytics.api'
import { recommendationsApi } from '@/api/recommendations.api'
import type { TasteProfileInfo, TasteTrack } from '@/api/recommendations.api'
import { tracksApi } from '@/api/tracks.api'
import { useQueue } from '@/hooks/queue.hook'
import { SettingsGroup } from '../components/SettingsPrimitives'
import { cn } from '@/lib/utils'
import { formatCount } from '@/lib/formatters'

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

// ── Taste helpers ────────────────────────────────────────────

function PersonaCard({ persona }: { persona: NonNullable<TasteProfileInfo['persona']> }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-[var(--accent-subtle)] to-transparent border border-[var(--accent-border)]">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/15 flex items-center justify-center text-xl flex-shrink-0">
          {persona.emoji}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--accent)]">Your listener type</p>
          <p className="text-base font-bold text-[var(--text-primary)] leading-tight mt-0.5">{persona.label}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{persona.description}</p>
        </div>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border)]">
      {children}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function StatsSection() {
  const { playTrack } = useQueue()
  const queryClient = useQueryClient()

  const { data: taste, isLoading: loadingTaste } = useQuery({
    queryKey: ['taste', 'profile'],
    queryFn: recommendationsApi.getTaste,
    staleTime: 60_000,
    retry: false,
  })

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['analytics', 'stats'],
    queryFn: analyticsApi.getStats,
    staleTime: 60_000,
    retry: false,
  })

  const { data: topArtists } = useQuery({
    queryKey: ['analytics', 'top-artists'],
    queryFn: () => analyticsApi.getTopArtists(30, 5),
    staleTime: 60_000,
    retry: false,
  })

  const { data: hourlyData } = useQuery({
    queryKey: ['analytics', 'hourly'],
    queryFn: () => analyticsApi.getListeningByHour(30),
    staleTime: 60_000,
    retry: false,
  })

  const { data: dailyData } = useQuery({
    queryKey: ['analytics', 'daily'],
    queryFn: () => analyticsApi.getListeningByDay(7),
    staleTime: 60_000,
    retry: false,
  })

  const hourly = hourlyData?.hours ?? []
  const maxHourly = Math.max(...hourly.map(h => h.plays), 1)
  const hourlyChart = hourly.map(h => ({ label: h.hour % 6 === 0 ? `${h.hour}` : '', value: h.plays }))

  const daily = dailyData?.days ?? []
  const maxDaily = Math.max(...daily.map(d => d.plays), 1)
  const dailyChart = daily.map(d => ({ label: d.day, value: d.plays }))

  const dbUnavailable = !loadingStats && !stats && hourly.length === 0 && daily.length === 0

  const playTasteTrack = (t: TasteTrack) => {
    // Resolve the full track (local DB → API) then play it
    tracksApi.getTrack(t.track_id)
      .then(full => playTrack(full, [full]))
      .catch(() => { /* track may be unavailable — ignore */ })
  }

  const hasTasteData = (taste?.total_plays ?? 0) > 0

  return (
    <div className="space-y-4 pb-4">

      {/* ── Your taste (works with or without MongoDB) ──────── */}
      <div className="mb-7">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Your taste
          </p>
          {hasTasteData && (
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['taste', 'profile'] })}
              className="flex items-center gap-1 px-2.5 py-1 -mr-1 rounded-full text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          )}
        </div>
        <div className="bg-[var(--bg-surface)] rounded-[18px] overflow-hidden divide-y divide-[var(--border)]/50 border border-[var(--border)]/30">
        {loadingTaste ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-2xl bg-[var(--bg-elevated)] animate-pulse" />
            ))}
          </div>
        ) : !hasTasteData ? (
          <div className="flex flex-col items-center justify-center py-8 px-6 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">No taste profile yet</p>
              <p className="text-xs text-[var(--text-muted)] mt-1 max-w-[260px]">
                Play a few songs and your most-replayed tracks, favourite artists and listener type will show up here.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {/* Persona */}
            {taste?.persona && <PersonaCard persona={taste.persona} />}

            {/* Most replayed */}
            {taste && taste.top_tracks.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)] mb-1.5 px-1">
                  Most replayed
                </p>
                <div className="space-y-0.5">
                  {taste.top_tracks.map((t, i) => (
                    <button
                      key={t.track_id}
                      onClick={() => playTasteTrack(t)}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-[var(--bg-elevated)] active:bg-[var(--bg-elevated)] transition-colors group"
                    >
                      <span className="text-xs font-bold text-[var(--text-muted)] w-4 text-center tabular-nums flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="w-8 h-8 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                        <Play className="w-3 h-3 ml-0.5 fill-current" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">{t.title}</span>
                        <span className="block text-xs text-[var(--text-muted)] truncate">{t.artist}</span>
                      </span>
                      <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">
                        {t.plays}×
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Favourite artists */}
            {taste && taste.top_artists.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)] mb-1.5 px-1">
                  Favourite artists
                </p>
                <div className="flex flex-wrap gap-1.5 px-1">
                  {taste.top_artists.slice(0, 8).map(a => (
                    <Chip key={a.artist}>
                      {a.artist}
                      <span className="text-[var(--text-muted)] ml-1 tabular-nums">{a.plays} plays</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {/* Top genres — the kind of music you like */}
            {taste && taste.top_genres.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)] mb-1.5 px-1">
                  Music you like
                </p>
                <div className="flex flex-wrap gap-1.5 px-1">
                  {taste.top_genres.slice(0, 8).map(g => (
                    <Chip key={g.genre}>
                      {g.genre}
                      <span className="text-[var(--text-muted)] ml-1 tabular-nums">{g.plays} plays</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-[var(--text-muted)] px-1">
              {formatCount(taste?.total_plays ?? 0)} total plays · {taste?.total_likes ?? 0} liked
            </p>
          </div>
        )}
        </div>
      </div>

      {/* ── MongoDB-backed analytics ─────────────────────────── */}
      {dbUnavailable ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
          <BarChart3 className="w-8 h-8 text-[var(--text-muted)]/30" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">Detailed analytics need MongoDB</p>
          <p className="text-xs text-[var(--text-muted)] max-w-[260px]">
            Listening charts, hours and daily patterns require MongoDB. Your taste profile above works from local history.
          </p>
        </div>
      ) : (
        <>
          {/* Overview */}
          {loadingStats ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 rounded-2xl bg-[var(--bg-elevated)] animate-pulse" />
              ))}
            </div>
          ) : stats ? (
            <SettingsGroup title="Overview">
              <div className="grid grid-cols-2 gap-3 p-3">
                <StatCard icon={Music2} label="Total plays" value={formatCount(stats.total_plays)} />
                <StatCard icon={Clock} label="Listening time" value={`${stats.estimated_listening_hours}h`} />
                <StatCard icon={Heart} label="Liked tracks" value={stats.total_likes} />
                <StatCard icon={Users} label="Artists played" value={stats.unique_artists_30d} />
                <StatCard icon={Calendar} label="Active days" value={stats.active_days_30d} />
                <StatCard icon={TrendingUp} label="Plays (7d)" value={stats.plays_7d} />
              </div>
            </SettingsGroup>
          ) : null}

          {/* Hourly chart */}
          {hourly.length > 0 && (
            <SettingsGroup title="Listening by hour">
              <div className="p-4">
                <BarChart data={hourlyChart} maxValue={maxHourly} />
              </div>
            </SettingsGroup>
          )}

          {/* Daily chart */}
          {daily.length > 0 && (
            <SettingsGroup title="Listening by day">
              <div className="p-4">
                <BarChart data={dailyChart} maxValue={maxDaily} />
              </div>
            </SettingsGroup>
          )}

          {/* Top artists */}
          {topArtists && topArtists.artists.length > 0 && (
            <SettingsGroup title="Top artists (30 days)">
              {topArtists.artists.map((a, i) => (
                <div
                  key={a.artist}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)]/40 last:border-0"
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
            </SettingsGroup>
          )}
        </>
      )}
    </div>
  )
}
