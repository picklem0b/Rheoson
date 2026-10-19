import { create } from 'zustand';

import { shuffledCopy } from '@/lib/shuffle';
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
	/** Put a track at the front of what is coming up, unless it is already there. */
	playNext: (track: Track) => boolean;
	removeFromQueue: (index: number) => void;
	clearQueue: () => void;
	next: (isShuffled: boolean) => Track | null;
	prev: () => Track | null;
	/** Jump to an upcoming track: everything before it becomes history. */
	jumpTo: (index: number) => Track | null;
	/** Remove a track from the queue and make it history — engine-driven advance. */
	take: (trackId: string) => Track | null;
	shuffleQueue: () => void;
	restoreQueue: () => void;
	moveItem: (from: number, to: number) => void;
}

/** True when the track is currently playing or already somewhere in the queue. */
function isPresent(state: Pick<QueueStore, 'history' | 'queue'>, trackId: string): boolean {
	const playing = state.history[state.history.length - 1];
	return playing?.id === trackId || state.queue.some(item => item.id === trackId);
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
		if (isPresent(state, track.id)) return false;
		set({ queue: [...state.queue, track] });
		return true;
	},

	playNext: track => {
		const state = get();
		if (isPresent(state, track.id)) return false;
		set({ queue: [track, ...state.queue] });
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
			// The target becomes the current track, so it stays as the last
			// history entry. Dropping it too left the current track outside
			// history entirely, which made the next advance forget it.
			history: history.slice(0, -1),
			queue: [current, ...queue]
		});

		return target;
	},

	jumpTo: index => {
		const { queue, history } = get();
		const target = queue[index];
		if (!target) return null;

		set({
			// The skipped-over tracks stay in history: pressing previous after
			// a jump should walk back through them, not to the track that was
			// playing before the jump.
			queue: queue.slice(index + 1),
			history: [...history, ...queue.slice(0, index + 1)]
		});

		return target;
	},

	take: trackId => {
		const { queue, history } = get();
		const index = queue.findIndex(item => item.id === trackId);
		const track = index >= 0 ? queue[index] : undefined;
		if (!track) return null;

		set({
			queue: queue.filter((_, i) => i !== index),
			history: [...history, track]
		});
		return track;
	},

	shuffleQueue: () => set(state => ({ queue: shuffledCopy(state.queue) })),

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
