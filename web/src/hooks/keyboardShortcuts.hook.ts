import { useEffect } from 'react'
import { usePlayer } from './player.hook'
import { usePlayerStore } from '@/store/player.store'
import { useUIStore } from '@/store/ui.store'
import { clamp } from '@/lib/utils'
import { PLAYER_DEFAULTS } from '@/lib/constants'

export function useKeyboardShortcuts() {
  const { togglePlay, seek, skipNext, skipPrev } = usePlayer()
  const { cycleRepeat, toggleShuffle } = usePlayerStore()
  const { toggleQueue, toggleLyrics } = useUIStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept shortcuts while the user is typing
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return

      // Read progress/duration/volume fresh from the store inside the handler
      // to avoid stale closure values from the effect dependency array.
      const { progress, duration, volume, setVolume } = usePlayerStore.getState()

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlay()
          break

        case 'ArrowRight':
          e.preventDefault()
          seek(clamp(progress + PLAYER_DEFAULTS.seekStep, 0, duration))
          break

        case 'ArrowLeft':
          e.preventDefault()
          seek(clamp(progress - PLAYER_DEFAULTS.seekStep, 0, duration))
          break

        case 'ArrowUp':
          e.preventDefault()
          setVolume(clamp(volume + 0.1, 0, 1))
          break

        case 'ArrowDown':
          e.preventDefault()
          setVolume(clamp(volume - 0.1, 0, 1))
          break

        case 'KeyN': skipNext();       break
        case 'KeyP': skipPrev();       break
        case 'KeyR': cycleRepeat();    break
        case 'KeyS': toggleShuffle();  break
        case 'KeyQ': toggleQueue();    break
        case 'KeyL': toggleLyrics();   break

        case 'KeyM': {
          const { isMuted, toggleMute } = usePlayerStore.getState()
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
  // Stable function references only — no primitive values in deps,
  // so the handler is never stale and never needlessly re-registers.
  }, [togglePlay, seek, skipNext, skipPrev, cycleRepeat, toggleShuffle, toggleQueue, toggleLyrics])
}
