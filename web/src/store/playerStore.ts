import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Track } from '@/types/track'
import type { RepeatMode } from '@/types/player'
import { PLAYER_DEFAULTS } from '@/lib/constants'

// ── Types ─────────────────────────────────────────────────────

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

  setTrack:      (track: Track) => void
  setPlaying:    (v: boolean) => void
  setLoading:    (v: boolean) => void
  setVolume:     (v: number) => void
  toggleMute:    () => void
  setProgress:   (v: number) => void
  setDuration:   (v: number) => void
  cycleRepeat:   () => void
  toggleShuffle: () => void
  reset:         () => void
}

// ── Constants ─────────────────────────────────────────────────

const REPEAT_CYCLE: RepeatMode[] = ['off', 'all', 'one']

// ── Store ─────────────────────────────────────────────────────

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

      setTrack:    (track) => set({ currentTrack: track, progress: 0, duration: 0, isLoading: true }),
      setPlaying:  (v)     => set({ isPlaying: v }),
      setLoading:  (v)     => set({ isLoading: v }),

      // Clamp volume to [0, 1] here so callers don't have to
      setVolume:   (v)     => set({ volume: Math.max(0, Math.min(1, v)), isMuted: v === 0 }),
      toggleMute:  ()      => set((s) => ({ isMuted: !s.isMuted })),

      setProgress: (v)     => set({ progress: v }),
      setDuration: (v)     => set({ duration: v }),

      cycleRepeat: () => {
        const idx = REPEAT_CYCLE.indexOf(get().repeatMode)
        set({ repeatMode: REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length] })
      },

      toggleShuffle: () => set((s) => ({ isShuffled: !s.isShuffled })),

      reset: () => set({
        currentTrack: null,
        isPlaying:    false,
        isLoading:    false,
        progress:     0,
        duration:     0,
      }),
    }),
    {
      name: 'shulker-player',
      partialize: (s) => ({
        // Rehydrate these on reload so PlayerBar and volume survive tab closes
        currentTrack: s.currentTrack,
        volume:       s.volume,
        isMuted:      s.isMuted,
        repeatMode:   s.repeatMode,
        isShuffled:   s.isShuffled,
        // Do NOT persist isPlaying/isLoading/progress/duration:
        // they're ephemeral and should always start fresh.
      }),
    },
  ),
)
