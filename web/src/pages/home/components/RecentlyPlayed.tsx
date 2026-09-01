/**
 * RecentlyPlayed — full-page view of every recently played track.
 * Lives under pages/home/components because it's only ever reached
 * from Home's "Quick picks → See all" button, not linked from anywhere else.
 *
 * Route: /recently-played (registered in router.tsx)
 * Backend: GET /api/tracks/recently-played (returns up to 50, hydrated)
 *          DELETE /api/tracks/history (clears the history file)
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Play, Shuffle, Trash2 } from 'lucide-react'
import { useQueue } from '@/hooks/queue.hook'
import { usePlayerStore } from '@/store/player.store'
import { tracksApi } from '@/api/tracks.api'
import TopBar from '@/components/layout/TopBar'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Track } from '@/types/track.types'

// ── Track row ─────────────────────────────────────────────────

function TrackRow({ track, index, onClick }: {
  track: Track; index: number; onClick: () => void
}) {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying    = usePlayerStore((s) => s.isPlaying)
  const active       = currentTrack?.id === track.id

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.3) }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left',
        active ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--bg-elevated)]',
      )}
    >
      <div className="relative flex-shrink-0">
        {track.artworkUrl
          ? <img src={track.artworkUrl} alt={track.title} className="w-12 h-12 rounded-xl object-cover" />
          : <div className="w-12 h-12 rounded-xl bg-[var(--bg-elevated)]" />
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
        <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
          {track.artist?.name ?? 'Unknown Artist'}
        </p>
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">
        {formatDuration(track.duration)}
      </span>
    </motion.button>
  )
}

// ── Page ──────────────────────────────────────────────────────

export default function RecentlyPlayed() {
  const { playAll, playTrack } = useQueue()
  const queryClient            = useQueryClient()
  const [clearing, setClearing] = useState(false)

  const { data: tracks, isLoading } = useQuery({
    queryKey: ['recently-played-full'],
    // Larger limit than the Home preview — this is the full view
    queryFn:  () => tracksApi.getRecentlyPlayed(50),
  })

  const handleClear = async () => {
    setClearing(true)
    try {
      await tracksApi.clearHistory()
      // Refresh both the full list and the Home preview query
      queryClient.invalidateQueries({ queryKey: ['recently-played-full'] })
      queryClient.invalidateQueries({ queryKey: ['recently-played'] })
    } finally {
      setClearing(false)
    }
  }

  const hasTracks = (tracks?.length ?? 0) > 0

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Recently Played" />

      {/* Action bar */}
      {hasTracks && (
        <div className="flex items-center gap-2 px-4 lg:px-8 pt-4 pb-2 flex-shrink-0">
          <Button variant="primary" size="md" onClick={() => playAll(tracks!)}>
            <Play className="w-4 h-4 fill-current" />
            Play all
          </Button>
          <Button variant="secondary" size="md" onClick={() => playAll(tracks!, { shuffle: true })}>
            <Shuffle className="w-4 h-4" />
            Shuffle
          </Button>
          <Button
            variant="ghost"
            size="md"
            loading={clearing}
            onClick={handleClear}
            className="ml-auto text-red-400"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1 px-4 lg:px-8 pb-6">
        {isLoading && (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        )}

        {!isLoading && !hasTracks && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-[var(--bg-elevated)] flex items-center justify-center">
              <Clock className="w-7 h-7 text-[var(--text-muted)]" />
            </div>
            <div>
              <p className="font-bold text-[var(--text-primary)]">No history yet</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Songs you play will show up here
              </p>
            </div>
          </div>
        )}

        {!isLoading && hasTracks && (
          <div className="space-y-1 pt-2">
            {tracks!.map((track, i) => (
              <TrackRow
                key={`${track.id}-${i}`}
                track={track}
                index={i}
                onClick={() => playTrack(track, tracks!)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}