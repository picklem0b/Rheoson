import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface ChromaticImageProps {
  src: string
  alt: string
  className?: string
  /** Fallback source shown when the primary image fails to load. */
  fallbackSrc?: string
  /**
   * Peak channel offset in pixels at full hover/idle intensity.
   * 6 reads as a subtle lens fringe; 14+ is a deliberate glitch.
   */
  intensity?: number
  /** Animate the aberration continuously instead of only on hover. */
  animated?: boolean
}

/**
 * Image with a chromatic-aberration fringe.
 *
 * Renders the same source three times: one sharp copy on top of a red-shifted
 * and a cyan-shifted copy blended with `mix-blend-screen`. On hover the copies
 * separate further, which gives album art a "lens" shimmer — the same effect
 * the shared hero-picture component is built on.
 *
 * Pure CSS: no canvas, no extra image decoding beyond the one `src`, so it is
 * cheap enough to sit behind a scrolling list.
 */
export function ChromaticImage({
  src,
  alt,
  className,
  fallbackSrc,
  intensity = 6,
  animated = false,
}: ChromaticImageProps) {
  const [failed, setFailed] = useState(false)
  const [hovered, setHovered] = useState(false)

  const resolved = failed && fallbackSrc ? fallbackSrc : src
  const offset = hovered || animated ? intensity : intensity / 3

  return (
    <div
      className={cn('relative isolate overflow-hidden bg-surface', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Red channel */}
      <img
        src={resolved}
        alt=''
        aria-hidden
        draggable={false}
        className='pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70 mix-blend-screen transition-transform duration-500 ease-out'
        style={{
          transform: `translate3d(${-offset}px, 0, 0) scale(1.04)`,
          filter: 'saturate(1.6) hue-rotate(-25deg)',
        }}
        onError={() => setFailed(true)}
      />

      {/* Cyan channel */}
      <img
        src={resolved}
        alt=''
        aria-hidden
        draggable={false}
        className='pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70 mix-blend-screen transition-transform duration-500 ease-out'
        style={{
          transform: `translate3d(${offset}px, 0, 0) scale(1.04)`,
          filter: 'saturate(1.6) hue-rotate(150deg)',
        }}
        onError={() => setFailed(true)}
      />

      {/* Sharp copy */}
      <img
        src={resolved}
        alt={alt}
        draggable={false}
        loading='lazy'
        decoding='async'
        className='relative h-full w-full object-cover'
        onError={() => setFailed(true)}
      />
    </div>
  )
}

export default ChromaticImage
