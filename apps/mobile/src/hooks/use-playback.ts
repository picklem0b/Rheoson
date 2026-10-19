import { useCallback, useEffect, useRef } from 'react';
import TrackPlayer, { Event, useTrackPlayerEvents } from 'react-native-track-player';

import { tracksApi } from '@/api/tracks.api';
import { haptic } from '@/lib/haptics';
import * as engine from '@/services/player';
import { usePlayerStore } from '@/store/player.store';
import { useQueueStore } from '@/store/queue.store';
import { useSettingsStore } from '@/store/settings.store';
import { toast } from '@/store/toast.store';
import type { Track } from '@rheoson/api-types';

/** How often the UI samples the engine for position. */
const PROGRESS_TICK_MS = 500;

/**
 * Events this hook listens to. Module-level so the subscription is installed
 * once: the hook compares the array by identity, and a literal here would tear
 * down and re-add the native listeners on every render.
 */
const PLAYER_EVENTS: Event[] = [
	Event.PlaybackQueueEnded,
	Event.PlaybackActiveTrackChanged,
	Event.PlaybackError
];

/**
 * The bridge between the stores and the audio engine.
 *
 * Mounted once, in the root layout. It is the only place that reacts to "a
 * track was chosen": the stores say what should happen, the engine does it, and
 * the engine's own events flow back into the store so the UI can never claim to
 * be playing while the native player is paused or buffering.
 *
 * Three behaviours here exist because the native queue is real:
 *
 *  * **The engine can advance by itself.** Upcoming tracks live in the native
 *    queue, so a track ending moves the engine to the next one without any JS
 *    callback. `PlaybackActiveTrackChanged` folds that back into the queue
 *    store, otherwise the mini player would still show the finished track.
 *  * **Shuffle is a queue order, not a play mode.** Turning it on reorders the
 *    upcoming list and turning it off restores the album; the engine never
 *    needs to know.
 *  * **A cold start resumes but does not autoplay.** The last track and its
 *    position come back; audio waits for a tap.
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
	playFromQueue: (index: number) => void;
	seek: (seconds: number) => void;
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
	const jumpTo = useQueueStore(state => state.jumpTo);
	const queue = useQueueStore(state => state.queue);
	const autoplayEnabled = useSettingsStore(state => state.autoplay);
	const warmAhead = useSettingsStore(state => state.warmAhead);
	const resumeOnLaunch = useSettingsStore(state => state.resumeOnLaunch);

	/** Prevents a remount from restoring the same position twice. */
	const restored = useRef(false);

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

	/**
	 * Restore the persisted track after the stores rehydrate.
	 *
	 * Persisted state arrives asynchronously from AsyncStorage, so this cannot
	 * read it at mount: it waits for hydration, then loads the track *paused*
	 * at the saved position.
	 */
	useEffect(() => {
		const restore = (): void => {
			if (restored.current) return;
			restored.current = true;
			if (!resumeOnLaunch) return;

			const { currentTrack, savedProgress, autoPlayPending } = usePlayerStore.getState();
			if (!currentTrack || autoPlayPending) return;
			void engine.restoreTrack(currentTrack, savedProgress);
		};

		if (usePlayerStore.persist.hasHydrated()) {
			restore();
			return undefined;
		}
		return usePlayerStore.persist.onFinishHydration(restore);
	}, [resumeOnLaunch]);

	/** Keep the native queue in step with what is up next. */
	useEffect(() => {
		void engine.syncUpcoming(queue.slice(0, 20));
		if (warmAhead && queue[0]) void tracksApi.warm(queue[0]!.id).catch(() => undefined);
	}, [queue, warmAhead]);

	/** Repeat mode is engine state, not UI state. */
	useEffect(() => {
		void engine.setRepeatMode(repeatMode);
	}, [repeatMode]);

	/** Shuffle on reorders what is coming up; shuffle off puts the album back. */
	useEffect(() => {
		const store = useQueueStore.getState();
		if (isShuffled) store.shuffleQueue();
		else store.restoreQueue();
	}, [isShuffled]);

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
				setTrack(previous, { autoplay: true });
			}
		});
	}, [prevFromQueue, setTrack]);

	const toggle = useCallback(async () => {
		void haptic('light');
		const { isPlaying, currentTrack } = usePlayerStore.getState();

		if (isPlaying) {
			await engine.pause();
			setPlaying(false);
			return;
		}
		if (!currentTrack) return;

		// The engine may be empty — a launch with resume disabled, or a failed
		// restore. Asking it to play nothing used to be a tap that did nothing.
		const active = await engine.activeTrackId();
		if (!active || active !== currentTrack.id) {
			setLoading(true);
			await engine.loadTrack(currentTrack, true);
			setLoading(false);
		} else {
			await engine.play();
		}
		setPlaying(true);
		void tracksApi.recordPlay(currentTrack.id).catch(() => undefined);
	}, [setLoading, setPlaying]);

	/** Jump to a track that is already in the upcoming queue. */
	const playFromQueue = useCallback(
		(index: number) => {
			void haptic('light');
			const target = jumpTo(index);
			if (target) {
				setTrack(target, { autoplay: true });
			}
		},
		[jumpTo, setTrack]
	);

	/** Scrub. The store is updated immediately so the scrubber does not snap back. */
	const seek = useCallback(
		(seconds: number) => {
			const target = Math.max(0, seconds);
			setProgress(target);
			saveProgress(target);
			void engine.seekTo(target);
		},
		[saveProgress, setProgress]
	);

	useTrackPlayerEvents(PLAYER_EVENTS, event => {
		if (event.type === Event.PlaybackQueueEnded) {
			next(true);
			return;
		}

		if (event.type === Event.PlaybackError) {
			setPlaying(false);
			toast(event.message ? `Playback stopped: ${event.message}` : 'Playback stopped');
			return;
		}

		if (event.type === Event.PlaybackActiveTrackChanged) {
			const active = event.track;
			if (!active?.id) return;

			const current = usePlayerStore.getState().currentTrack;
			const activeId = String(active.id);
			if (current?.id === activeId) return;

			// The engine moved on by itself. Take that track out of the queue
			// and into history without touching audio, which is already right.
			const taken = useQueueStore.getState().take(activeId);
			if (!taken) return;

			setTrack(taken, { autoplay: false });
			setPlaying(true);
			void tracksApi.recordPlay(taken.id).catch(() => undefined);
		}
	});

	return {
		playTrack,
		toggle: () => void toggle(),
		next: () => next(false),
		prev,
		playFromQueue,
		seek
	};
}
