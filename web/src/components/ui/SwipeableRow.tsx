import { useRef, type ReactNode } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'

interface SwipeAction {
  icon: ReactNode
  label: string
  color: string
  bgColor: string
  onClick: () => void
}

interface SwipeableRowProps {
  children: ReactNode
  rightActions?: SwipeAction[]
  leftActions?: SwipeAction[]
}

/**
 * SwipeableRow — reveals action buttons when swiped left or right.
 * Common mobile pattern for delete, like, share, etc.
 */
export default function SwipeableRow({
  children,
  rightActions = [],
  leftActions = [],
}: SwipeableRowProps) {
  const x = useMotionValue(0)
  const rowRef = useRef<HTMLDivElement>(null)

  const rightWidth = rightActions.length * 64
  const leftWidth = leftActions.length * 64

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const threshold = 50

    if (info.offset.x < -threshold && rightActions.length > 0) {
      // Swipe left → reveal right actions
      animate(x, -Math.min(rightWidth, 192), { type: 'spring', damping: 25, stiffness: 300 })
    } else if (info.offset.x > threshold && leftActions.length > 0) {
      // Swipe right → reveal left actions
      animate(x, Math.min(leftWidth, 192), { type: 'spring', damping: 25, stiffness: 300 })
    } else {
      // Snap back
      animate(x, 0, { type: 'spring', damping: 25, stiffness: 300 })
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Background action buttons */}
      <div className="absolute inset-0 flex">
        {/* Left actions */}
        <div className="flex items-center">
          {leftActions.map((action, i) => (
            <button
              key={i}
              onClick={() => { action.onClick(); animate(x, 0, { type: 'spring', damping: 25 }) }}
              className="h-full flex items-center justify-center"
              style={{ width: 64, background: action.bgColor }}
            >
              <span className="flex flex-col items-center gap-1">
                <span style={{ color: action.color }}>{action.icon}</span>
                <span className="text-[9px] font-bold" style={{ color: action.color }}>
                  {action.label}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {/* Right actions */}
        <div className="flex items-center">
          {rightActions.map((action, i) => (
            <button
              key={i}
              onClick={() => { action.onClick(); animate(x, 0, { type: 'spring', damping: 25 }) }}
              className="h-full flex items-center justify-center"
              style={{ width: 64, background: action.bgColor }}
            >
              <span className="flex flex-col items-center gap-1">
                <span style={{ color: action.color }}>{action.icon}</span>
                <span className="text-[9px] font-bold" style={{ color: action.color }}>
                  {action.label}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Foreground content */}
      <motion.div
        ref={rowRef}
        style={{ x }}
        drag="x"
        dragConstraints={{ left: leftActions.length > 0 ? -rightWidth : 0, right: rightActions.length > 0 ? leftWidth : 0 }}
        dragElastic={0.1}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        className="relative bg-[var(--bg-surface)] cursor-grab active:cursor-grabbing"
      >
        {children}
      </motion.div>
    </div>
  )
}
