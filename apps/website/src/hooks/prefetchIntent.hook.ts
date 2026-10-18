import { useCallback, useRef } from 'react'
import { prefetchStream } from '@/lib/prefetch'

/**
 * Intent prefetching for track rows.
 *
 * A remote track cannot start until yt-dlp has produced its first bytes, and
 * that spawn is what users experience as "the song takes 7-30 s to start".
 * Warming only on play means every single play pays that cost.
 *
 * This hook warms the track the moment the user shows intent — pointer over
 * the row, touch-down, or keyboard focus — so by the time the click lands the
 * backend already has audio buffering. Prefetch is idempotent per track
 * (see `prefetchStream`), so repeated hovers cost nothing.
 *
 * Spread the returned props onto the row element:
 *
 *     const intent = usePrefetchOnIntent(track.id)
 *     <motion.button {...intent} onClick={play} />
 *
 * A 120 ms pointer delay keeps fast mouse sweeps across a long list from
 * queuing a warm-up for every row they cross.
 */
export function usePrefetchOnIntent(trackId: string | undefined, delayMs = 120) {
  const timer = useRef<number | null>(null)

  const warm = useCallback(() => {
    if (trackId) prefetchStream(trackId)
  }, [trackId])

  const schedule = useCallback(() => {
    if (!trackId) return
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      warm()
    }, delayMs)
  }, [trackId, warm, delayMs])

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  // Touch has no hover state — warm immediately so the buffers overlap with
  // the user releasing their finger.
  const onPointerDown = useCallback(() => warm(), [warm])

  return {
    onPointerEnter: schedule,
    onPointerLeave: cancel,
    onPointerDown,
    onFocus: warm,
  }
}

export default usePrefetchOnIntent
