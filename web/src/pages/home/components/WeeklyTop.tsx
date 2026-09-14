import { motion } from 'framer-motion'
import { Play, TrendingUp, Trophy } from 'lucide-react'
import { useQueue } from '@/hooks/queue.hook'
import { usePlayerStore } from '@/store/player.store'
import { usePrefetchOnIntent } from '@/hooks/prefetchIntent.hook'
import { useTrackContextMenu } from '@/hooks/useTrackContextMenu'
import { HeroBackdrop } from '@/components/New-Components/hero-picture/background'
import { TooltipButton } from '@/components/New-Components/Icons-and-Buttons/tooltip-button'
import { formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Track } from '@/types/track.types'

/** 1.2M / 340K / 912 — compact enough for a badge. */
function formatPlays(count: number): string {
  if (!count) return ''
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`
  return String(count)
}

/** "2026-W37" → "Week 37" — the API's cache bucket, made readable. */
function weekLabel(week: string | undefined): string {
  if (!week) return 'This week'
  const part = week.split('-W')[1]
  return part ? `Week ${Number(part)}` : 'This week'
}

// ── Hero ──────────────────────────────────────────────────────

/**
 * Hero banner: the week's number-one track rendered with the UI kit's
 * chromatic-artwork treatment, plus a one-tap play.
 */
export function WeeklyHero({ track }: { track: Track | undefined }) {
  const { playTrack } = useQueue()
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const intent = usePrefetchOnIntent(track?.id)

  if (!track) return null

  const isCurrent = currentTrack?.id === track.id

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 26, stiffness: 240 }}
      className='relative overflow-hidden rounded-4xl border border-[var(--border)]/60 bg-[var(--bg-surface)]'
    >
      <div className='flex flex-col items-center gap-5 p-5 sm:flex-row sm:gap-6 sm:p-6'>
        <HeroBackdrop
          src={track.artworkUrl || '/assets/logo.png'}
          alt={track.title}
          className='w-full sm:w-1/2'
        />

        <div className='min-w-0 flex-1 text-center sm:text-left'>
          <div className='inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-subtle)] px-2.5 py-1 text-[10px] font-bold tracking-widest text-[var(--accent)] uppercase'>
            <Trophy className='h-3 w-3' />
            #1 this week
          </div>

          <h2 className='mt-3 line-clamp-2 text-xl leading-tight font-bold text-[var(--text-primary)] sm:text-2xl'>
            {track.title}
          </h2>
          <p className='mt-1 truncate text-sm text-[var(--text-secondary)]'>
            {track.artist?.name ?? 'Unknown Artist'}
          </p>

          <div className='mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)] sm:justify-start'>
            {track.album?.title && <span className='truncate'>{track.album.title}</span>}
            {track.duration > 0 && <span className='tabular-nums'>{formatDuration(track.duration)}</span>}
            {track.playCount > 0 && <span className='tabular-nums'>{formatPlays(track.playCount)} plays</span>}
          </div>

          <div className='mt-4 flex justify-center sm:justify-start'>
            <TooltipButton
              title={`Play “${track.title}”`}
              description='Starts the week’s biggest track and queues the rest of the top 10 behind it.'
              badge={<span className='flex items-center gap-1'><TrendingUp className='h-3 w-3' /> Trending now</span>}
              onClick={() => playTrack(track, [track])}
              {...intent}
            >
              <Play className={cn('h-4 w-4 fill-current', isPlaying && isCurrent && 'hidden')} />
              {isPlaying && isCurrent ? 'Playing' : 'Play #1'}
            </TooltipButton>
          </div>
        </div>
      </div>
    </motion.section>
  )
}

// ── Top 3 podium ──────────────────────────────────────────────

interface WeeklyTopThreeProps {
  tracks: Track[]
  /** Full weekly list — the tapped track's queue context. */
  context: Track[]
  week?: string
}

/**
 * Ranks 2 and 3 beside the hero's number one, each with the detail the chart
 * data actually carries: position, artwork, artist, album, length and plays.
 */
export function WeeklyTopThree({ tracks, context, week }: WeeklyTopThreeProps) {
  const { playTrack } = useQueue()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  // The hero already shows #1; this rail carries the runners-up.
  const runners = tracks.slice(1, 3)
  if (runners.length === 0) return null

  return (
    <section>
      <div className='mb-3 flex items-center justify-between'>
        <div className='flex items-center gap-2.5'>
          <div className='flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--accent-subtle)]'>
            <Trophy className='h-3.5 w-3.5 text-[var(--accent)]' />
          </div>
          <div>
            <h2 className='text-base leading-none font-bold text-[var(--text-primary)]'>
              Top 3 this week
            </h2>
            <p className='mt-0.5 text-xs text-[var(--text-muted)]'>
              {weekLabel(week)} · charted on YouTube Music
            </p>
          </div>
        </div>
      </div>

      <div className='grid gap-3 sm:grid-cols-2'>
        {runners.map((track, i) => (
          <TopThreeCard
            key={track.id}
            track={track}
            position={(track.rank || i + 2)}
            active={currentTrack?.id === track.id}
            isPlaying={isPlaying}
            context={context}
            onPlay={() => playTrack(track, context)}
          />
        ))}
      </div>
    </section>
  )
}

interface TopThreeCardProps {
  track: Track
  position: number
  active: boolean
  isPlaying: boolean
  context: Track[]
  onPlay: () => void
}

function TopThreeCard({
  track,
  position,
  active,
  isPlaying,
  onPlay,
}: TopThreeCardProps) {
  const contextMenu = useTrackContextMenu(track)
  const intent = usePrefetchOnIntent(track.id)

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: position * 0.05 }}
      whileTap={{ scale: 0.98 }}
      onClick={onPlay}
      {...contextMenu}
      {...intent}
      className={cn(
        'group flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
        active
          ? 'border-[var(--accent-border)] bg-[var(--accent-subtle)]'
          : 'border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]'
      )}
    >
      <div className='relative h-16 w-16 flex-shrink-0'>
        {track.artworkUrl ? (
          <img
            src={track.artworkUrl}
            alt={track.title}
            loading='lazy'
            decoding='async'
            className='h-16 w-16 rounded-xl object-cover'
          />
        ) : (
          <div className='h-16 w-16 rounded-xl bg-[var(--bg-elevated)]' />
        )}

        {/* Rank badge */}
        <span
          className={cn(
            'absolute -top-1.5 -left-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black shadow-lg',
            active
              ? 'bg-[var(--accent)] text-white'
              : 'bg-[var(--bg-base)] text-[var(--text-primary)] ring-1 ring-[var(--border)]'
          )}
        >
          {position}
        </span>

        {active && isPlaying && (
          <div className='absolute inset-0 flex items-center justify-center rounded-xl bg-black/45'>
            <div className='flex h-3 items-end gap-[2px]'>
              {[0, 1, 2].map((j) => (
                <motion.div
                  key={j}
                  className='w-[2px] rounded-full bg-white'
                  animate={{ height: ['40%', '100%', '60%'] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: j * 0.15 }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className='min-w-0 flex-1'>
        <p
          className={cn(
            'truncate text-sm font-semibold',
            active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
          )}
        >
          {track.title}
        </p>
        <p className='truncate text-xs text-[var(--text-secondary)]'>
          {track.artist?.name ?? 'Unknown Artist'}
        </p>
        <div className='mt-1 flex items-center gap-2 text-[10px] text-[var(--text-muted)]'>
          {track.album?.title && (
            <span className='truncate'>{track.album.title}</span>
          )}
          {track.duration > 0 && (
            <span className='tabular-nums'>{formatDuration(track.duration)}</span>
          )}
          {track.playCount > 0 && (
            <span className='tabular-nums'>{formatPlays(track.playCount)}</span>
          )}
        </div>
      </div>

      <span className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] opacity-0 transition-opacity group-hover:opacity-100'>
        <Play className='ml-0.5 h-4 w-4 fill-current text-[var(--text-primary)]' />
      </span>
    </motion.button>
  )
}
