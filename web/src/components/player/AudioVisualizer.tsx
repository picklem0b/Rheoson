import { motion } from 'framer-motion'
import { useAudioAnalyser } from '@/hooks/audioAnalyser.hook'
import { usePlayerStore } from '@/store/player.store'
import { cn } from '@/lib/utils'

interface AudioVisualizerProps {
  barCount?: number
  className?: string
  variant?: 'bars' | 'wave' | 'dots'
}

/**
 * AudioVisualizer — real-time frequency visualization.
 * Uses the Web Audio API analyser via useAudioAnalyser hook.
 */
export default function AudioVisualizer({
  barCount = 24,
  className,
  variant = 'bars',
}: AudioVisualizerProps) {
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const bars = useAudioAnalyser(barCount)

  if (!isPlaying) return null

  if (variant === 'dots') {
    return (
      <div className={cn('flex items-center justify-center gap-[3px]', className)}>
        {bars.slice(0, barCount).map((val, i) => (
          <div
            key={i}
            className="w-1 h-1 rounded-full bg-[var(--accent)]"
            style={{
              opacity: 0.3 + val * 0.7,
              transform: `scale(${0.5 + val * 1.5})`,
            }}
          />
        ))}
      </div>
    )
  }

  if (variant === 'wave') {
    const points = bars.map((val, i) => {
      const x = (i / (bars.length - 1)) * 100
      const y = 50 - val * 40
      return `${x},${y}`
    }).join(' ')

    return (
      <svg
        viewBox="0 0 100 60"
        className={cn('w-full h-10', className)}
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.6 }}
        />
        <polyline
          points={`0,50 ${points} 100,50`}
          fill="url(#gradient)"
          stroke="none"
          style={{ opacity: 0.15 }}
        />
        <defs>
          <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    )
  }

  // Default: bars
  return (
    <div className={cn('flex items-end justify-center gap-[2px]', className)}>
      {bars.slice(0, barCount).map((val, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-[var(--accent)]"
          style={{
            height: `${Math.max(2, val * 100)}%`,
            opacity: 0.4 + val * 0.6,
          }}
          animate={{
            height: `${Math.max(2, val * 100)}%`,
          }}
          transition={{ duration: 0.1 }}
        />
      ))}
    </div>
  )
}
