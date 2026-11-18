import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * One placeholder, one aspect, one failure state.
 *
 * Provider artwork is served by whichever mirror answers first, and a mirror
 * that 503s must not leave a browser's broken-image glyph in the middle of a
 * row. A track without art and a track whose art failed look the same, because
 * to a listener they are the same thing.
 */
export function ArtworkImage({ src, className }: { src?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span
        aria-hidden
        className={cn(
          'flex items-center justify-center rounded-sm bg-accent text-2xs text-muted-foreground',
          className,
        )}
      >
        ♪
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('rounded-sm object-cover', className)}
    />
  )
}
