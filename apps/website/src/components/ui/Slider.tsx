import { useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { clamp } from '@/lib/utils'

interface SliderProps {
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  onChangeEnd?: (value: number) => void
  className?: string
  trackClassName?: string
  thumbClassName?: string
  showThumb?: boolean
  accent?: boolean
}

export function Slider({
  value,
  min = 0,
  max = 1,
  step,
  onChange,
  onChangeEnd,
  className,
  showThumb = true,
  accent = false,
}: SliderProps) {
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const pct = clamp(((value - min) / (max - min)) * 100, 0, 100)

  const compute = useCallback((clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect) return value
    const raw = (clientX - rect.left) / rect.width
    let v = clamp(raw, 0, 1) * (max - min) + min
    if (step) v = Math.round(v / step) * step
    return clamp(v, min, max)
  }, [value, min, max, step])

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    onChange(compute(e.clientX))

    const onMove = (e: MouseEvent) => { if (dragging.current) onChange(compute(e.clientX)) }
    const onUp   = (e: MouseEvent) => {
      dragging.current = false
      onChangeEnd?.(compute(e.clientX))
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const onMove = (e: TouchEvent) => onChange(compute(e.touches[0].clientX))
    const onEnd  = (e: TouchEvent) => {
      onChangeEnd?.(compute(e.changedTouches[0].clientX))
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    onChange(compute(e.touches[0].clientX))
  }

  return (
    <div
      ref={track}
      className={cn('relative flex items-center h-5 cursor-pointer group', className)}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      {/* Track */}
      <div className="absolute inset-x-0 h-1 rounded-full bg-[var(--border-strong)] overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-none',
            accent ? 'bg-[var(--accent)]' : 'bg-[var(--text-primary)]'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Thumb */}
      {showThumb && (
        <div
          className={cn(
            'absolute w-3.5 h-3.5 rounded-full shadow-lg -translate-x-1/2',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
            accent ? 'bg-[var(--accent)]' : 'bg-white'
          )}
          style={{ left: `${pct}%` }}
        />
      )}
    </div>
  )
}