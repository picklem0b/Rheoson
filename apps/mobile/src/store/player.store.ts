import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { RepeatMode, Track } from '@rheoson/api-types';

/**
 * Playback state — what is playing, where it is, and how the user wants the
 * queue to behave.
 *
 * Two things are deliberately *not* here: the audio engine (that is
 * `services/player.ts`, which owns the native player) and the queue contents
 * (`store/queue.store.ts`). This store is the single answer to "what is the
 * player showing", and the engine writes into it — never the other way round,
 * so a stalled stream can never leave the UI claiming to play.
 *
 * Persisted: the track, its position, and the playback preferences. Never the
 * transport state — an app that opens already "playing" would be lying, and
 * Android will not start audio without a user gesture anyway.
 */
interface PlayerStore {
	currentTrack: Track | null;
	isPlaying: boolean;
	isLoading: boolean;
	/** Seconds. */
	progress: number;
	/** Seconds. */
	duration: number;
	/** Last known position, persisted so a cold start resumes in place. */
	savedProgress: number;

	/** 0–1. */
	volume: number;
	isMuted: boolean;
	repeatMode: RepeatMode;
	isShuffled: boolean;

	/**
	 * Where playback started ("Favourites", "Trending this week"), shown in the
	 * full player's header. Session-scoped: it describes this listen, so
	 * persisting it would mislabel the next launch.
	 */
	playSource: string;
	setPlaySource: (label: string) => void;

	/**
	 * Set when a track is chosen by the user or advanced by the queue, and
	 * consumed by the playback hook, which then starts audio. Restoring a
	 * persisted track leaves this false on purpose.
	 */
	autoPlayPending: boolean;

	setTrack: (track: Track | null, opts?: { autoplay?: boolean }) => void;
	consumeAutoPlay: () => boolean;
	setPlaying: (value: boolean) => void;
	setLoading: (value: boolean) => void;
	setProgress: (seconds: number) => void;
	setDuration: (seconds: number) => void;
	saveProgress: (seconds: number) => void;
	setVolume: (value: number) => void;
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
			playSource: 'Your library',
			autoPlayPending: false,

			setPlaySource: label => set({ playSource: label }),

			setTrack: (track, opts) => {
				set({
					currentTrack: track,
					isPlaying: false,
					isLoading: false,
					progress: 0,
					duration: 0,
					savedProgress: 0,
					// Default true: every caller outside boot-restore is a user
					// action or a queue advance, and both should start audio.
					autoPlayPending: Boolean(track) && (opts?.autoplay ?? true)
				});
			},

			consumeAutoPlay: () => {
				const pending = get().autoPlayPending;
				if (pending) set({ autoPlayPending: false });
				return pending;
			},

			setPlaying: value => set({ isPlaying: value }),
			setLoading: value => set({ isLoading: value }),
			setProgress: seconds => set({ progress: seconds }),
			setDuration: seconds => set({ duration: seconds }),
			// Written every few seconds during playback and on pause, so a
			// process kill resumes from the last known position instead of 0:00.
			saveProgress: seconds => set({ savedProgress: seconds }),

			setVolume: value => {
				const clamped = Math.min(1, Math.max(0, value));
				set({ volume: clamped, isMuted: false });
			},

			toggleMute: () => set(state => ({ isMuted: !state.isMuted })),

			cycleRepeat: () => {
				const index = REPEAT_CYCLE.indexOf(get().repeatMode);
				set({ repeatMode: REPEAT_CYCLE[(index + 1) % REPEAT_CYCLE.length]! });
			},

			toggleShuffle: () => set(state => ({ isShuffled: !state.isShuffled }))
		}),
		{
			name: 'rheoson-player',
			storage: createJSONStorage(() => AsyncStorage),
			partialize: state => ({
				currentTrack: state.currentTrack,
				savedProgress: state.savedProgress,
				volume: state.volume,
				isMuted: state.isMuted,
				repeatMode: state.repeatMode,
				isShuffled: state.isShuffled
			})
		}
	)
);
