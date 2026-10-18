import { useCallback, useEffect, useRef } from 'react';
import TrackPlayer, { Event, useTrackPlayerEvents } from 'react-native-track-player';

import { tracksApi } from '@/api/tracks.api';
import { haptic } from '@/lib/haptics';
import * as engine from '@/services/player';
import { usePlayerStore } from '@/store/player.store';
import { useQueueStore } from '@/store/queue.store';
import { useSettingsStore } from '@/store/settings.store';
import type { Track } from '@rheoson/api-types';

/** How often the UI samples the engine for position. */
const PROGRESS_TICK_MS = 500;

/**
 * The bridge between the stores and the audio engine.
 *
 * Mounted once, in the root layout. It is the only place that reacts to "a
 * track was chosen": the stores say what should happen, the engine does it, and
 * the engine's own events flow back into the store so the UI can never claim to
 * be playing while the native player is paused or buffering.
 *
 * Everything a user does goes through `playTrack` / `toggle` / `next` / `prev`
 * — screens never call the engine directly, which is what keeps the queue,
 * history and progress in agreement.
 */
export function usePlayback(): {
	playTrack: (track: Track, context?: Track[], source?: string) => void;
	toggle: () => void;
	next: () => void;
	prev: () => void;
} {
	const setTrack = usePlayerStore(state => state.setTrack);
	const setPlaying = usePlayerStore(state => state.setPlaying);
	const setLoading = usePlayerStore(state => state.setLoading);
	const setProgress = usePlayerStore(state => state.setProgress);
	const setDuration = usePlayerStore(state => state.setDuration);
	const saveProgress = usePlayerStore(state => state.saveProgress);
	const consumeAutoPlay = usePlayerStore(state => state.consumeAutoPlay);
	const setPlaySource = usePlayerStore(state => state.setPlaySource);
	const repeatMode = usePlayerStore(state => state.repeatMode);
	const isShuffled = usePlayerStore(state => state.isShuffled);

	const setQueue = useQueueStore(state => state.setQueue);
	const nextFromQueue = useQueueStore(state => state.next);
	const prevFromQueue = useQueueStore(state => state.prev);
	const queue = useQueueStore(state => state.queue);
	const autoplayEnabled = useSettingsStore(state => state.autoplay);
	const warmAhead = useSettingsStore(state => state.warmAhead);

	const startedFor = useRef<string | null>(null);

	useEffect(() => {
		void engine.setupPlayer();
	}, []);

	/** Start a track: queue context first, then audio. */
	const playTrack = useCallback(
		(track: Track, context?: Track[], source?: string) => {
			const list = context && context.length > 0 ? context : [track];
			const index = Math.max(
				0,
				list.findIndex(item => item.id === track.id)
			);
			setQueue(list, index);
			if (source) setPlaySource(source);
			setTrack(track, { autoplay: true });
			startedFor.current = track.id;
		},
		[setQueue, setPlaySource, setTrack]
	);

	/** The store asked for a track → hand it to the engine. */
	useEffect(() => {
		let cancelled = false;
		if (!consumeAutoPlay()) return undefined;

		const current = usePlayerStore.getState().currentTrack;
		if (!current) return undefined;

		(async () => {
			setLoading(true);
			await engine.loadTrack(current);
			if (cancelled) return;
			setLoading(false);
			setPlaying(true);
			// History is a server concern and must never block playback.
			void tracksApi.recordPlay(current.id).catch(() => undefined);
		})();

		return () => {
			cancelled = true;
		};
	}, [consumeAutoPlay, setLoading, setPlaying]);

	/** Keep the native queue in step with what is up next. */
	useEffect(() => {
		void engine.syncUpcoming(queue.slice(0, 20));
		if (warmAhead && queue[0]) void tracksApi.warm(queue[0].id).catch(() => undefined);
	}, [queue, warmAhead]);

	/** Repeat mode is engine state, not UI state. */
	useEffect(() => {
		void engine.setRepeatMode(repeatMode);
	}, [repeatMode]);

	/** Position sampling, and the periodic position save. */
	useEffect(() => {
		const timer = setInterval(() => {
			void engine.readProgress().then(({ position, duration, playing }) => {
				setProgress(position);
				if (duration > 0) setDuration(duration);
				const store = usePlayerStore.getState();
				if (store.isPlaying !== playing) setPlaying(playing);
				if (position > 0 && Math.floor(position) % 5 === 0) saveProgress(position);
			});
		}, PROGRESS_TICK_MS);
		return () => clearInterval(timer);
	}, [setProgress, setDuration, setPlaying, saveProgress]);

	/** Advance to the next track — from the queue store, then from the engine. */
	const next = useCallback(
		(automatic = false) => {
			void haptic('light');
			const nextTrack = nextFromQueue(isShuffled);
			if (nextTrack) {
				startedFor.current = nextTrack.id;
				setTrack(nextTrack, { autoplay: true });
				return;
			}
			if (automatic && autoplayEnabled) {
				// Queue empty: ask the server for a radio continuation rather
				// than falling silent mid-listen.
				void (async () => {
					const current = usePlayerStore.getState().currentTrack;
					if (!current) return;
					try {
						const radio = await import('@/api/recommendations.api').then(m =>
							m.recommendationsApi.radio(current.id)
						);
						const playable = radio.filter(item => item.id !== current.id);
						if (playable.length > 0) {
							setQueue(playable, 0);
							const first = playable[0];
							if (first) {
								setTrack(first, { autoplay: true });
								startedFor.current = first.id;
							}
						}
					} catch {
						// Nothing to continue with; stopping is correct.
					}
				})();
			}
		},
		[autoplayEnabled, isShuffled, nextFromQueue, setQueue, setTrack]
	);

	const prev = useCallback(() => {
		void haptic('light');
		void engine.readProgress().then(({ position }) => {
			// Standard transport behaviour: restart the track unless the user
			// is near the very beginning, in which case go back one.
			if (position > 3) {
				void engine.seekTo(0);
				return;
			}
			const previous = prevFromQueue();
			if (previous) {
				startedFor.current = previous.id;
				setTrack(previous, { autoplay: true });
			}
		});
	}, [prevFromQueue, setTrack]);

	const toggle = useCallback(() => {
		void haptic('light');
		const { isPlaying } = usePlayerStore.getState();
		if (isPlaying) {
			void engine.pause();
			setPlaying(false);
		} else {
			void engine.play();
			setPlaying(true);
		}
	}, [setPlaying]);

	/** The engine finished a track — advance unless repeat-one is on. */
	useTrackPlayerEvents([Event.PlaybackQueueEnded, Event.PlaybackActiveTrackChanged], event => {
		if (event.type === Event.PlaybackQueueEnded) next(true);
	});

	return { playTrack, toggle, next: () => next(false), prev };
}
