import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@/types/track.types';
import type { RepeatMode } from '@/types/player.types';
import { prefetchStream } from '@/lib/prefetch';

interface PlayerStore {
    // Playback state
    currentTrack: Track | null;
    isPlaying: boolean;
    isLoading: boolean;
    progress: number; // seconds
    duration: number; // seconds
    savedProgress: number; // persisted position — survives page reload

    // Controls
    volume: number; // 0–1
    isMuted: boolean;
    repeatMode: RepeatMode;
    isShuffled: boolean;

    // Actions
    setTrack: (track: Track | null) => void;
    setPlaying: (v: boolean) => void;
    setLoading: (v: boolean) => void;
    setProgress: (s: number) => void;
    setDuration: (s: number) => void;
    saveProgress: (s: number) => void;
    setVolume: (v: number) => void;
    toggleMute: () => void;
    cycleRepeat: () => void;
    toggleShuffle: () => void;
}

const REPEAT_CYCLE: RepeatMode[] = ['off', 'all', 'one'];

export const usePlayerStore = create<PlayerStore>()(
    persist(
        (set, get) => ({
            currentTrack: null,
            isPlaying: false,
            isLoading: false,
            progress: 0,
            duration: 0,
            savedProgress: 0,
            volume: 0.85,
            isMuted: false,
            repeatMode: 'off',
            isShuffled: false,

            setTrack: track => {
                set({
                    currentTrack: track,
                    isPlaying: false,
                    isLoading: false,
                    progress: 0,
                    duration: 0,
                    savedProgress: 0
                });
                // Prefetch stream URL for instant playback
                if (track?.id) prefetchStream(track.id);
            },

            setPlaying: v => set({ isPlaying: v }),
            setLoading: v => set({ isLoading: v }),
            setProgress: s => set({ progress: s }),
            setDuration: s => set({ duration: s }),
            // saveProgress is written every ~5 s during playback (and on pause/stop)
            // so a hard refresh or Android kill restores from the last known position.
            saveProgress: s => set({ savedProgress: s }),

            setVolume: v => {
                const clamped = Math.min(1, Math.max(0, v));
                set({ volume: clamped, isMuted: false });
            },

            toggleMute: () => set(s => ({ isMuted: !s.isMuted })),

            cycleRepeat: () => {
                const { repeatMode } = get();
                const idx = REPEAT_CYCLE.indexOf(repeatMode);
                const next = REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length];
                set({ repeatMode: next });
            },

            toggleShuffle: () => set(s => ({ isShuffled: !s.isShuffled }))
        }),
        {
            name: 'rheoson-player',
            // Only persist the settings + track identity + saved position.
            // Never persist isPlaying or isLoading — the app always starts paused,
            // and the Howl is rebuilt by usePlayer's resume-after-reload effect.
            partialize: s => ({
                currentTrack: s.currentTrack,
                savedProgress: s.savedProgress,
                volume: s.volume,
                isMuted: s.isMuted,
                repeatMode: s.repeatMode,
                isShuffled: s.isShuffled
            })
        }
    )
);
