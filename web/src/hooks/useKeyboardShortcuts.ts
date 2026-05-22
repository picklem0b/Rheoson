import { useEffect } from 'react'
import { usePlayer } from './usePlayer'
import { usePlayerStore } from '@/store/playerStore'
import { useUIStore } from '@/store/uiStore'
import { clamp } from '@/lib/utils'
import { PLAYER_DEFAULTS } from '@/lib/constants'

export function useKeyboardShortcuts() {
  const { togglePlay, seek, skipNext, skipPrev } = usePlayer()
  const { progress, duration, volume, setVolume, cycleRepeat, toggleShuffle } = usePlayerStore()
  const { toggleQueue, toggleLyrics } = useUIStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

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
        case 'KeyN':
          skipNext()
          break
        case 'KeyP':
          skipPrev()
          break
        case 'KeyR':
          cycleRepeat()
          break
        case 'KeyS':
          toggleShuffle()
          break
        case 'KeyQ':
          toggleQueue()
          break
        case 'KeyL':
          toggleLyrics()
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [progress, duration, volume, togglePlay, seek, skipNext, skipPrev, setVolume, cycleRepeat, toggleShuffle, toggleQueue, toggleLyrics])
}