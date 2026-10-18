import { create } from 'zustand';

import type { Track } from '@rheoson/api-types';

/**
 * The play queue.
 *
 * `history` carries the current track as its last entry — that is what makes
 * "previous" cheap and what the full player's Up next tab shows as already
 * played. `originalQueue` is the order the user started from, so turning
 * shuffle off restores the album instead of leaving a scrambled list behind.
 *
 * Not persisted: a queue is a moment, and restoring yesterday's would be a
 * surprise rather than a feature. What *is* persisted (player store) is the
 * track and position, so reopening the app continues where it stopped.
 */
interface QueueStore {
	queue: Track[];
	history: Track[];
	originalQueue: Track[];

	setQueue: (tracks: Track[], startIndex?: number) => void;
	addToQueue: (track: Track) => boolean;
	removeFromQueue: (index: number) => void;
	clearQueue: () => void;
	next: (isShuffled: boolean) => Track | null;
	prev: () => Track | null;
	shuffleQueue: () => void;
	restoreQueue: () => void;
	moveItem: (from: number, to: number) => void;
}

function shuffled<T>(items: T[]): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j]!, copy[i]!];
	}
	return copy;
}

export const useQueueStore = create<QueueStore>((set, get) => ({
	queue: [],
	history: [],
	originalQueue: [],

	setQueue: (tracks, startIndex = 0) => {
		if (tracks.length === 0) {
			set({ queue: [], history: [], originalQueue: [] });
			return;
		}
		const safeIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
		set({
			// Everything after the chosen track is upcoming...
			queue: tracks.slice(safeIndex + 1),
			// ...and everything up to and including it is history.
			history: tracks.slice(0, safeIndex + 1),
			originalQueue: tracks
		});
	},

	addToQueue: track => {
		const state = get();
		const alreadyQueued = state.queue.some(item => item.id === track.id);
		const playing = state.history[state.history.length - 1];
		// Refusing duplicates keeps "Add to queue" from turning into a loop of
		// the same song when the button is tapped twice.
		if (alreadyQueued || playing?.id === track.id) return false;
		set({ queue: [...state.queue, track] });
		return true;
	},

	removeFromQueue: index => set(state => ({ queue: state.queue.filter((_, i) => i !== index) })),

	clearQueue: () => set({ queue: [], history: [], originalQueue: [] }),

	next: isShuffled => {
		const { queue, history } = get();
		if (queue.length === 0) return null;

		const index = isShuffled ? Math.floor(Math.random() * queue.length) : 0;
		const nextTrack = queue[index]!;

		set({
			queue: queue.filter((_, i) => i !== index),
			history: [...history, nextTrack]
		});

		return nextTrack;
	},

	prev: () => {
		const { history, queue } = get();
		if (history.length < 2) return null;

		const current = history[history.length - 1]!;
		const target = history[history.length - 2]!;

		set({
			history: history.slice(0, -2),
			queue: [current, ...queue]
		});

		return target;
	},

	shuffleQueue: () => set(state => ({ queue: shuffled(state.queue) })),

	restoreQueue: () =>
		set(state => {
			// Shuffle off: everything after the current position comes back in
			// its original order.
			const played = state.history.length;
			const original = state.originalQueue.length
				? state.originalQueue.slice(played)
				: state.queue;
			return { queue: original };
		}),

	moveItem: (from, to) =>
		set(state => {
			const queue = [...state.queue];
			const [item] = queue.splice(from, 1);
			if (item) queue.splice(to, 0, item);
			return { queue };
		})
}));
