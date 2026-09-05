import { useCallback, useRef } from 'react'
import { useContextMenuStore } from '@/store/contextMenu.store'
import type { Track } from '@/types/track.types'

/**
 * Attaches context-menu behaviour to any track row:
 *
 *  - right-click  → pointer popover at the cursor
 *  - long-press   → bottom-sheet (touch screens), with haptic buzz
 *
 * Spread the returned props onto the row's root element. The long-press
 * suppresses the click that follows so the row doesn't also start
 * playback when the menu opens.
 */
export function useTrackContextMenu(track: Track) {
  const timer = useRef<number | null>(null)
  const fired = useRef(false)

  const openPointer = useContextMenuStore((s) => s.openPointer)
  const openSheet = useContextMenuStore((s) => s.openSheet)

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      openPointer(track, e.clientX, e.clientY)
    },
    [track, openPointer]
  )

  const onTouchStart = useCallback(
    () => {
      fired.current = false
      clearTimer()
      timer.current = window.setTimeout(() => {
        fired.current = true
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(12)
        }
        openSheet(track)
      }, 500)
    },
    [track, openSheet, clearTimer]
  )

  const cancelLongPress = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  // If a long-press fired, swallow the click that the browser synthesises
  // on release so the row's own onClick doesn't start playback.
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (fired.current) {
      e.preventDefault()
      e.stopPropagation()
      fired.current = false
    }
  }, [])

  return {
    onContextMenu,
    onTouchStart,
    onTouchEnd: cancelLongPress,
    onTouchMove: cancelLongPress,
    onTouchCancel: cancelLongPress,
    onClickCapture,
  }
}