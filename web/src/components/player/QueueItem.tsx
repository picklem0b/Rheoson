import { motion } from 'framer-motion'
import { GripVertical, X } from 'lucide-react'
import type { Track } from '@/types/track'
import { usePlayerStore } from '@/store/playerStore'
import { useQueue } from '@/hooks/useQueue'
import { IconButton } from '@/components/ui/IconButton'
import { formatDuration, truncate } from '@/lib/formatters'
import { cn } from '@/lib/utils'

interface QueueItemProps {
  track: Track
  index: number
}

export default function QueueItem({ track, index }: QueueItemProps) {
  const currentTrack  = usePlayerStore((s) => s.currentTrack)
  const { playTrack, removeFromQueue } = useQueue()
  const isActive = currentTrack?.id === track.id

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0  }}
      exit={{    opacity: 0, x: 20  }}
      transition={{ delay: index * 0.04 }}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-200',
        isActive
          ? 'bg-[var(--accent-subtle)] border border-[var(--accent-border)]'
          : 'hover:bg-[var(--bg-elevated)]'
      )}
    >
      {/* Drag handle */}
      <GripVertical className="w-4 h-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 cursor-grab flex-shrink-0" />

      {/* Artwork */}
      <button
        onClick={() => playTrack(track)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <img
          src={track.artworkUrl}
          alt={track.title}
          className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className={cn(
            'text-sm font-semibold truncate',
            isActive ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
          )}>
            {truncate(track.title, 30)}
          </p>
          <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
            {track.artist.name}
          </p>
        </div>
        <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">
          {formatDuration(track.duration)}
        </span>
      </button>

      {/* Remove */}
      <IconButton
        size="xs"
        variant="ghost"
        onClick={() => removeFromQueue(index)}
        className="opacity-0 group-hover:opacity-100"
      >
        <X />
      </IconButton>
    </motion.div>
  )
}