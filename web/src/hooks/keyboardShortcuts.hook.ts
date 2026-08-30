import { useEffect, useRef } from 'react'
import { usePlayer } from './player.hook'
import { usePlayerStore } from '@/store/player.store'
import { useUIStore } from '@/store/ui.store'
import { clamp } from '@/lib/utils'
import { PLAYER_DEFAULTS } from '@/lib/constants'

export function useKeyboardShortcuts() {
  const { togglePlay, seek, skipNext, skipPrev } = usePlayer()
  const { cycleRepeat, toggleShuffle } = usePlayerStore()
  const { toggleQueue, toggleLyrics } = useUIStore()

  // Use refs so the handler always calls the latest functions
  // without re-registering on every render.
  const togglePlayRef    = useRef(togglePlay)
  const seekRef          = useRef(seek)
  const skipNextRef      = useRef(skipNext)
  const skipPrevRef      = useRef(skipPrev)
  const cycleRepeatRef   = useRef(cycleRepeat)
  const toggleShuffleRef = useRef(toggleShuffle)
  const toggleQueueRef   = useRef(toggleQueue)
  const toggleLyricsRef  = useRef(toggleLyrics)

  useEffect(() => { togglePlayRef.current    = togglePlay },    [togglePlay])
  useEffect(() => { seekRef.current          = seek },          [seek])
  useEffect(() => { skipNextRef.current      = skipNext },      [skipNext])
  useEffect(() => { skipPrevRef.current      = skipPrev },      [skipPrev])
  useEffect(() => { cycleRepeatRef.current   = cycleRepeat },   [cycleRepeat])
  useEffect(() => { toggleShuffleRef.current = toggleShuffle }, [toggleShuffle])
  useEffect(() => { toggleQueueRef.current   = toggleQueue },   [toggleQueue])
  useEffect(() => { toggleLyricsRef.current  = toggleLyrics },  [toggleLyrics])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept shortcuts while the user is typing
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return

      // Read fresh from the store inside the handler to avoid stale closures.
      const { progress, duration, volume, setVolume } = usePlayerStore.getState()

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlayRef.current()
          break

        case 'ArrowRight':
          e.preventDefault()
          seekRef.current(clamp(progress + PLAYER_DEFAULTS.seekStep, 0, duration))
          break

        case 'ArrowLeft':
          e.preventDefault()
          seekRef.current(clamp(progress - PLAYER_DEFAULTS.seekStep, 0, duration))
          break

        case 'ArrowUp':
          e.preventDefault()
          setVolume(clamp(volume + 0.1, 0, 1))
          break

        case 'ArrowDown':
          e.preventDefault()
          setVolume(clamp(volume - 0.1, 0, 1))
          break

        case 'KeyN': skipNextRef.current();       break
        case 'KeyP': skipPrevRef.current();       break
        case 'KeyR': cycleRepeatRef.current();    break
        case 'KeyS': toggleShuffleRef.current();  break
        case 'KeyQ': toggleQueueRef.current();    break
        case 'KeyL': toggleLyricsRef.current();   break

        case 'KeyM': {
          const { toggleMute } = usePlayerStore.getState()
          toggleMute()
          break
        }

        case 'KeyF': {
          const { toggleFullscreen } = useUIStore.getState()
          toggleFullscreen()
          break
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // All state accessed via refs — handler is stable forever.
}
