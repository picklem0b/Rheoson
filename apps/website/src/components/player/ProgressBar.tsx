import { usePlayerStore } from '@/store/player.store'
import { usePlayer } from '@/hooks/player.hook'
import { Slider } from '@/components/ui/Slider'
import { formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  compact?: boolean   // thin strip with no timestamps (PlayerBar top edge)
  large?:   boolean   // full with large timestamps (NowPlaying)
}

export default function ProgressBar({ compact = false, large = false }: ProgressBarProps) {
  const { progress, duration, currentTrack } = usePlayerStore()
  const { seek } = usePlayer()

  // Don't render if nothing is loaded
  if (!currentTrack || duration === 0) {
    if (compact) return <div className="h-[2px] w-full bg-[var(--border)]" />
    return null
  }

  if (compact) {
    return (
      <div className="relative h-[2px] w-full bg-[var(--border)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-[var(--accent)] transition-none"
          style={{ width: `${(progress / duration) * 100}%` }}
        />
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-1 w-full', large ? 'gap-2' : 'gap-1')}>
      <Slider
        value={progress}
        min={0}
        max={duration}
        onChange={seek}
        onChangeEnd={seek}
        accent
        className={large ? 'h-7' : 'h-5'}
      />
      <div className="flex justify-between px-0.5">
        <span className={cn(
          'tabular-nums text-[var(--text-muted)] font-medium',
          large ? 'text-xs' : 'text-[10px]'
        )}>
          {formatDuration(progress)}
        </span>
        <span className={cn(
          'tabular-nums text-[var(--text-muted)] font-medium',
          large ? 'text-xs' : 'text-[10px]'
        )}>
          {formatDuration(duration)}
        </span>
      </div>
    </div>
  )
}