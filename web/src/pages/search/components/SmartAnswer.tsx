import { motion } from 'framer-motion'
import { Mic, Sparkles, X } from 'lucide-react'
import type { SmartSearchResult } from '@/api/search.api'
import { useQueue } from '@/hooks/queue.hook'
import { usePrefetchOnIntent } from '@/hooks/prefetchIntent.hook'
import { usePlayerStore } from '@/store/player.store'
import { Spinner } from '@/components/ui/Spinner'
import { formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Track } from '@/types'

interface SmartAnswerProps {
  result: SmartSearchResult | null
  isAsking: boolean
  error: string | null
  onPlay: (track: Track, queue: Track[]) => void
  onClear: () => void
}

/**
 * Renders a natural-language answer.
 *
 * Shows the intent as a headline ("More like this", "Top 5 Hip-Hop this
 * week") plus the one-line explanation the backend returned, then the tracks.
 * That labelling is the whole point: the user asked a question and gets told
 * how it was understood, instead of silently receiving whatever a keyword
 * match produced.
 */
export function SmartAnswer({
  result,
  isAsking,
  error,
  onPlay,
  onClear,
}: SmartAnswerProps) {
  if (!result && !isAsking && !error) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mt-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-subtle)]/40 p-3"
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          {isAsking ? (
            <div className="flex items-center gap-2 py-1">
              <Spinner size="sm" />
              <span className="text-[13px] text-[var(--text-secondary)]">
                Working out what you meant…
              </span>
            </div>
          ) : error ? (
            <p className="py-1 text-[13px] text-red-400">{error}</p>
          ) : result ? (
            <>
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {result.label}
                {result.week && (
                  <span className="ml-1.5 text-[10px] font-semibold tracking-widest text-[var(--text-muted)] uppercase">
                    {result.week}
                  </span>
                )}
              </p>
              {result.message && (
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  {result.message}
                </p>
              )}
            </>
          ) : null}
        </div>

        <button
          onClick={onClear}
          aria-label="Clear the answer"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {result && result.tracks.length > 0 && (
        <div className="mt-2.5 space-y-0.5">
          {result.tracks.slice(0, 8).map((track, i) => (
            <SmartTrackRow
              key={track.id}
              track={track}
              index={i}
              onPlay={() => onPlay(track, result.tracks)}
            />
          ))}
        </div>
      )}

      {result && result.tracks.length === 0 && (
        <p className="mt-2 py-1 text-center text-[13px] text-[var(--text-muted)]">
          Nothing to play for that — try naming an artist or a category.
        </p>
      )}
    </motion.div>
  )
}

function SmartTrackRow({
  track,
  index,
  onPlay,
}: {
  track: Track
  index: number
  onPlay: () => void
}) {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const intent = usePrefetchOnIntent(track.id)
  const isActive = currentTrack?.id === track.id

  return (
    <motion.button
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      whileTap={{ scale: 0.98 }}
      onClick={onPlay}
      {...intent}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors',
        isActive ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--bg-elevated)]'
      )}
    >
      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--bg-elevated)]">
        {track.artworkUrl && (
          <img
            src={track.artworkUrl}
            alt={track.title}
            loading="lazy"
            decoding="async"
            className="h-10 w-10 object-cover"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-[13px] font-semibold',
            isActive ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
          )}
        >
          {track.title}
        </p>
        <p className="truncate text-[11px] text-[var(--text-secondary)]">
          {track.artist?.name ?? 'Unknown Artist'}
        </p>
      </div>

      {isActive && isPlaying && (
        <Mic className="h-3.5 w-3.5 flex-shrink-0 text-[var(--accent)]" />
      )}

      <span className="flex-shrink-0 text-[11px] text-[var(--text-muted)] tabular-nums">
        {formatDuration(track.duration)}
      </span>
    </motion.button>
  )
}

export default SmartAnswer
