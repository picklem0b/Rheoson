import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Track } from '@/types/track'
import type { RepeatMode } from '@/types/player'
import { PLAYER_DEFAULTS } from '@/lib/constants'

interface PlayerStore {
  currentTrack:  Track | null
  isPlaying:     boolean
  isLoading:     boolean
  volume:        number
  isMuted:       boolean
  progress:      number
  duration:      number
  repeatMode:    RepeatMode
  isShuffled:    boolean

  /**
   * savedProgress: the last known progress position (seconds).
   * Persisted to localStorage so resume knows where to seek after reload.
   * Distinct from `progress` which is ephemeral (updates 4x/sec).
   */
  savedProgress: number

  setTrack:      (track: Track) => void
  setPlaying:    (v: boolean) => void
  setLoading:    (v: boolean) => void
  setVolume:     (v: number) => void
  toggleMute:    () => void
  setProgress:   (v: number) => void
  setDuration:   (v: number) => void
  saveProgress:  (v: number) => void
  cycleRepeat:   () => void
  toggleShuffle: () => void
  reset:         () => void
}

const REPEAT_CYCLE: RepeatMode[] = ['off', 'all', 'one']

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      currentTrack:  null,
      isPlaying:     false,
      isLoading:     false,
      volume:        PLAYER_DEFAULTS.volume,
      isMuted:       false,
      progress:      0,
      duration:      0,
      repeatMode:    'off',
      isShuffled:    false,
      savedProgress: 0,

      setTrack: (track) => set({
        currentTrack:  track,
        progress:      0,
        duration:      0,
        isLoading:     true,
        savedProgress: 0,
      }),

      setPlaying:  (v) => set({ isPlaying: v }),
      setLoading:  (v) => set({ isLoading: v }),
      setVolume:   (v) => set({ volume: Math.max(0, Math.min(1, v)), isMuted: v === 0 }),
      toggleMute:  ()  => set((s) => ({ isMuted: !s.isMuted })),
      setProgress: (v) => set({ progress: v }),
      setDuration: (v) => set({ duration: v }),

      // Called on pause/unload so the position survives a reload
      saveProgress: (v) => set({ savedProgress: v }),

      cycleRepeat: () => {
        const idx = REPEAT_CYCLE.indexOf(get().repeatMode)
        set({ repeatMode: REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length] })
      },

      toggleShuffle: () => set((s) => ({ isShuffled: !s.isShuffled })),

      reset: () => set({
        currentTrack:  null,
        isPlaying:     false,
        isLoading:     false,
        progress:      0,
        duration:      0,
        savedProgress: 0,
      }),
    }),
    {
      name: 'shulker-player',
      partialize: (s) => ({
        currentTrack:  s.currentTrack,
        volume:        s.volume,
        isMuted:       s.isMuted,
        repeatMode:    s.repeatMode,
        isShuffled:    s.isShuffled,
        savedProgress: s.savedProgress,
        // isPlaying / isLoading / progress / duration are ephemeral — not persisted
      }),
    },
  ),
)