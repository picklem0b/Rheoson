import { motion } from 'framer-motion'
import {
  Play, Pause, SkipBack, SkipForward,
  Shuffle, Repeat, Repeat1,
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { usePlayer } from '@/hooks/usePlayer'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

interface PlayerControlsProps {
  compact?:    boolean   // PlayerBar — all controls, moderate size
  mobileOnly?: boolean   // PlayerBar mobile — play/pause only
  large?:      boolean   // NowPlaying fullscreen — big controls
}

export default function PlayerControls({
  compact = false,
  mobileOnly = false,
  large = false,
}: PlayerControlsProps) {
  const {
    isPlaying, isLoading,
    repeatMode, isShuffled,
    cycleRepeat, toggleShuffle,
    currentTrack,
  } = usePlayerStore()

  const { togglePlay, skipNext, skipPrev } = usePlayer()

  // No track = no controls rendered at all
  if (!currentTrack) return null

  // ── Mobile bar: just play/pause ─────────────────────────────
  if (mobileOnly) {
    return (
      <PlayPauseButton
        isPlaying={isPlaying}
        isLoading={isLoading}
        onToggle={togglePlay}
        size="md"
      />
    )
  }

  const skipSize   = large ? 'lg'  : 'sm'
  const playSize   = large ? 'xl'  : 'md'
  const auxSize    = large ? 'md'  : 'sm'
  const gap        = large ? 'gap-6' : 'gap-1'

  return (
    <div className={cn('flex items-center', gap)}>

      {/* Shuffle */}
      <IconButton
        size={auxSize}
        variant="ghost"
        active={isShuffled}
        onClick={toggleShuffle}
        title="Shuffle"
        className={cn(!isShuffled && 'opacity-50')}
      >
        <Shuffle />
      </IconButton>

      {/* Prev */}
      <IconButton size={skipSize} variant="ghost" onClick={skipPrev} title="Previous">
        <SkipBack className="fill-current" />
      </IconButton>

      {/* Play / Pause */}
      <PlayPauseButton
        isPlaying={isPlaying}
        isLoading={isLoading}
        onToggle={togglePlay}
        size={playSize}
        large={large}
      />

      {/* Next */}
      <IconButton size={skipSize} variant="ghost" onClick={skipNext} title="Next">
        <SkipForward className="fill-current" />
      </IconButton>

      {/* Repeat */}
      <IconButton
        size={auxSize}
        variant="ghost"
        active={repeatMode !== 'off'}
        onClick={cycleRepeat}
        title={repeatMode === 'one' ? 'Repeat one' : repeatMode === 'all' ? 'Repeat all' : 'Repeat off'}
        className={cn(repeatMode === 'off' && 'opacity-50')}
      >
        {repeatMode === 'one' ? <Repeat1 /> : <Repeat />}
      </IconButton>

    </div>
  )
}

// ── Shared play/pause button ─────────────────────────────────
interface PlayPauseButtonProps {
  isPlaying: boolean
  isLoading: boolean
  onToggle:  () => void
  size:      'md' | 'lg' | 'xl'
  large?:    boolean
}

function PlayPauseButton({ isPlaying, isLoading, onToggle, size, large }: PlayPauseButtonProps) {
  const sizeMap = {
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  }
  const iconMap = {
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-7 h-7',
  }

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      onClick={onToggle}
      className={cn(
        'flex items-center justify-center rounded-full transition-all duration-200',
        'bg-[var(--text-primary)] text-[var(--bg-base)] shadow-lg',
        large && 'shadow-[0_0_30px_var(--accent-subtle)]',
        sizeMap[size],
      )}
    >
      {isLoading ? (
        <Spinner size={size === 'xl' ? 'md' : 'sm'} className="border-[var(--bg-base)]" />
      ) : isPlaying ? (
        <Pause className={cn(iconMap[size], 'fill-current')} />
      ) : (
        <Play  className={cn(iconMap[size], 'fill-current translate-x-0.5')} />
      )}
    </motion.button>
  )
}