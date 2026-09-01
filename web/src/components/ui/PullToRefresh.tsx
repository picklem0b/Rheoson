import { useState, useRef, useCallback, type ReactNode } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { RefreshCw } from 'lucide-react'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: ReactNode
  threshold?: number
  disabled?: boolean
}

/**
 * PullToRefresh — native-feel pull-to-refresh for mobile pages.
 * Uses Framer Motion for the physics-based animation.
 */
export default function PullToRefresh({
  onRefresh,
  children,
  threshold = 80,
  disabled = false,
}: PullToRefreshProps) {
  const [refreshing, setRefreshing] = useState(false)
  const pullY = useMotionValue(0)
  const spinnerRotation = useTransform(pullY, [0, threshold], [0, 360])
  const spinnerOpacity = useTransform(pullY, [0, threshold * 0.3, threshold], [0, 0.5, 1])
  const spinnerScale = useTransform(pullY, [0, threshold], [0.5, 1])
  const startY = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || refreshing) return
    const scrollTop = scrollRef.current?.scrollTop ?? 0
    if (scrollTop > 0) return // only pull when at top
    startY.current = e.touches[0].clientY
  }, [disabled, refreshing])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || refreshing || startY.current === null) return
    const scrollTop = scrollRef.current?.scrollTop ?? 0
    if (scrollTop > 0) {
      startY.current = null
      return
    }
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) {
      // Rubber-band effect: diminishing returns as you pull further
      const resistance = Math.min(1, 100 / (dy + 100))
      pullY.set(dy * resistance * 0.6)
    }
  }, [disabled, refreshing, pullY])

  const handleTouchEnd = useCallback(async () => {
    if (disabled || refreshing || startY.current === null) return
    startY.current = null
    const currentY = pullY.get()

    if (currentY >= threshold) {
      setRefreshing(true)
      // Keep the spinner visible during refresh
      animate(pullY, threshold * 0.6, { type: 'spring', damping: 20 })
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        animate(pullY, 0, { type: 'spring', damping: 20, stiffness: 300 })
      }
    } else {
      animate(pullY, 0, { type: 'spring', damping: 20, stiffness: 300 })
    }
  }, [disabled, refreshing, pullY, threshold, onRefresh])

  return (
    <div
      ref={scrollRef}
      className="relative h-full overflow-y-auto no-scrollbar"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <motion.div
        style={{ opacity: spinnerOpacity, scale: spinnerScale }}
        className="absolute top-0 inset-x-0 flex justify-center pt-4 z-10 pointer-events-none"
      >
        <motion.div
          style={{ rotate: spinnerRotation }}
          className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-center"
        >
          <RefreshCw
            className={`w-4 h-4 text-[var(--accent)] ${refreshing ? 'animate-spin' : ''}`}
          />
        </motion.div>
      </motion.div>

      {/* Content */}
      <motion.div style={{ y: pullY }}>
        {children}
      </motion.div>
    </div>
  )
}
