import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Track } from '@/types/track'
import type { RepeatMode } from '@/types/player'
import { PLAYER_DEFAULTS, STORAGE_KEYS } from '@/lib/constants'

interface PlayerStore {
  currentTrack:   Track | null
  isPlaying:      boolean
  isLoading:      boolean
  volume:         number
  isMuted:        boolean
  progress:       number
  duration:       number
  repeatMode:     RepeatMode
  isShuffled:     boolean

  // Actions
  setTrack:       (track: Track) => void
  setPlaying:     (v: boolean) => void
  setLoading:     (v: boolean) => void
  setVolume:      (v: number) => void
  toggleMute:     () => void
  setProgress:    (v: number) => void
  setDuration:    (v: number) => void
  cycleRepeat:    () => void
  toggleShuffle:  () => void
  reset:          () => void
}

const REPEAT_CYCLE: RepeatMode[] = ['off', 'all', 'one']

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      isPlaying:    false,
      isLoading:    false,
      volume:       PLAYER_DEFAULTS.volume,
      isMuted:      false,
      progress:     0,
      duration:     0,
      repeatMode:   'off',
      isShuffled:   false,

      setTrack:    (track)  => set({ currentTrack: track, progress: 0, isLoading: true }),
      setPlaying:  (v)      => set({ isPlaying: v }),
      setLoading:  (v)      => set({ isLoading: v }),
      setVolume:   (v)      => set({ volume: v, isMuted: v === 0 }),
      toggleMute:  ()       => set((s) => ({ isMuted: !s.isMuted })),
      setProgress: (v)      => set({ progress: v }),
      setDuration: (v)      => set({ duration: v }),

      cycleRepeat: () => {
        const current = get().repeatMode
        const idx = REPEAT_CYCLE.indexOf(current)
        set({ repeatMode: REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length] })
      },

      toggleShuffle: () => set((s) => ({ isShuffled: !s.isShuffled })),

      reset: () => set({
        currentTrack: null,
        isPlaying: false,
        isLoading: false,
        progress: 0,
        duration: 0,
      }),
    }),
    {
      name: STORAGE_KEYS.volume,
      partialize: (s) => ({ volume: s.volume, isMuted: s.isMuted, repeatMode: s.repeatMode, isShuffled: s.isShuffled }),
    }
  )
)