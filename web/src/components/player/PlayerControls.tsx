import { motion } from 'framer-motion'
import {
  Play, Pause, SkipBack, SkipForward,
  Shuffle, Repeat, Repeat1,
} from 'lucide-react'
import { usePlayerStore } from '@/store/player.store'
import { usePlayer } from '@/hooks/player.hook'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

interface PlayerControlsProps {
  compact?:    boolean
  mobileOnly?: boolean
  large?:      boolean
}

export default function PlayerControls({
  compact: _compact = false, // eslint-disable-line @typescript-eslint/no-unused-vars
  mobileOnly = false,
  large      = false,
}: PlayerControlsProps) {
  // Selective selectors — only re-render when these specific values change,
  // NOT on every progress/duration tick (was causing play/pause lag)
  const isPlaying    = usePlayerStore((s) => s.isPlaying)
  const isLoading    = usePlayerStore((s) => s.isLoading)
  const repeatMode   = usePlayerStore((s) => s.repeatMode)
  const isShuffled   = usePlayerStore((s) => s.isShuffled)
  const hasTrack     = usePlayerStore((s) => s.currentTrack !== null)
  const cycleRepeat  = usePlayerStore((s) => s.cycleRepeat)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)

  const { togglePlay, skipNext, skipPrev } = usePlayer()

  if (!hasTrack) return null

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

  const skipSize = large ? 'lg' : 'sm'
  const playSize = large ? 'xl' : 'md'
  const auxSize  = large ? 'md' : 'sm'
  const gap      = large ? 'gap-6' : 'gap-1'

  return (
    <div className={cn('flex items-center', gap)}>

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

      <IconButton size={skipSize} variant="ghost" onClick={skipPrev} title="Previous">
        <SkipBack className="fill-current" />
      </IconButton>

      <PlayPauseButton
        isPlaying={isPlaying}
        isLoading={isLoading}
        onToggle={togglePlay}
        size={playSize}
        large={large}
      />

      <IconButton size={skipSize} variant="ghost" onClick={skipNext} title="Next">
        <SkipForward className="fill-current" />
      </IconButton>

      <IconButton
        size={auxSize}
        variant="ghost"
        active={repeatMode !== 'off'}
        onClick={cycleRepeat}
        title={
          repeatMode === 'one' ? 'Repeat one' :
          repeatMode === 'all' ? 'Repeat all' : 'Repeat off'
        }
        className={cn(repeatMode === 'off' && 'opacity-50')}
      >
        {repeatMode === 'one' ? <Repeat1 /> : <Repeat />}
      </IconButton>

    </div>
  )
}

// ── PlayPauseButton ───────────────────────────────────────────

interface PlayPauseButtonProps {
  isPlaying: boolean
  isLoading: boolean
  onToggle:  () => void
  size:      'md' | 'lg' | 'xl'
  large?:    boolean
}

function PlayPauseButton({
  isPlaying,
  isLoading,
  onToggle,
  size,
  large,
}: PlayPauseButtonProps) {
  const sizeClass = {
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  }[size]

  const iconClass = {
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-7 h-7',
  }[size]

  const spinnerSize = size === 'xl' ? 'md' : 'sm'

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      onClick={onToggle}
      className={cn(
        'flex items-center justify-center rounded-full transition-all duration-200',
        'bg-[var(--text-primary)] text-[var(--bg-base)] shadow-lg',
        large && 'shadow-[0_0_30px_var(--accent-subtle)]',
        sizeClass,
      )}
    >
      {isLoading
        ? <Spinner size={spinnerSize} className="border-[var(--bg-base)]" />
        : isPlaying
          ? <Pause className={cn(iconClass, 'fill-current')} />
          : <Play  className={cn(iconClass, 'fill-current translate-x-0.5')} />
      }
    </motion.button>
  )
}