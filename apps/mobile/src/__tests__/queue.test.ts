import { beforeEach, describe, expect, it } from 'vitest';

import { shuffledCopy } from '@/lib/shuffle';
import { savedSummary } from '@/lib/offlineSize';
import { useQueueStore } from '@/store/queue.store';
import type { Track } from '@rheoson/api-types';

function track(id: string): Track {
	return {
		id,
		title: `Track ${id}`,
		artist: { id: 'artist', name: 'Artist' },
		album: { id: 'album', title: 'Album' },
		artworkUrl: '',
		duration: 180,
		streamUrl: '',
		filePath: '',
		isDownloaded: false,
		isLiked: false,
		youtubeId: '',
		spotifyId: '',
		addedAt: '',
		trackNumber: 0,
		playCount: 0,
		rank: 0
	} as Track;
}

const a = track('a');
const b = track('b');
const c = track('c');
const d = track('d');

beforeEach(() => {
	useQueueStore.setState({ queue: [], history: [], originalQueue: [] });
});

describe('queue', () => {
	it('splits a list around the chosen track', () => {
		useQueueStore.getState().setQueue([a, b, c, d], 1);
		const state = useQueueStore.getState();
		expect(state.history.map(item => item.id)).toEqual(['a', 'b']);
		expect(state.queue.map(item => item.id)).toEqual(['c', 'd']);
	});

	it('advances in order and remembers what played', () => {
		useQueueStore.getState().setQueue([a, b, c], 0);
		expect(useQueueStore.getState().next(false)?.id).toBe('b');
		expect(useQueueStore.getState().history.map(item => item.id)).toEqual(['a', 'b']);
		expect(useQueueStore.getState().queue.map(item => item.id)).toEqual(['c']);
	});

	it('goes back to the previous track and returns the current one to the front', () => {
		useQueueStore.getState().setQueue([a, b, c], 1);
		expect(useQueueStore.getState().prev()?.id).toBe('a');
		expect(useQueueStore.getState().history.map(item => item.id)).toEqual(['a']);
		expect(useQueueStore.getState().queue.map(item => item.id)).toEqual(['b', 'c']);
	});

	it('does nothing before the beginning', () => {
		useQueueStore.getState().setQueue([a], 0);
		expect(useQueueStore.getState().prev()).toBeNull();
	});

	it('jumps to an upcoming track and keeps the skipped ones in history', () => {
		useQueueStore.getState().setQueue([a, b, c, d], 0);
		expect(useQueueStore.getState().jumpTo(2)?.id).toBe('d');
		expect(useQueueStore.getState().history.map(item => item.id)).toEqual(['a', 'b', 'c', 'd']);
		expect(useQueueStore.getState().queue).toEqual([]);
	});

	it('takes a track chosen by the native player out of the queue', () => {
		useQueueStore.getState().setQueue([a, b, c], 0);
		expect(useQueueStore.getState().take('c')?.id).toBe('c');
		expect(useQueueStore.getState().queue.map(item => item.id)).toEqual(['b']);
		expect(useQueueStore.getState().history.map(item => item.id)).toEqual(['a', 'c']);
	});

	it('returns null for a track the queue does not have', () => {
		useQueueStore.getState().setQueue([a], 0);
		expect(useQueueStore.getState().take('zzz')).toBeNull();
	});

	it('refuses to queue the current or an already queued track', () => {
		useQueueStore.getState().setQueue([a, b], 0);
		expect(useQueueStore.getState().addToQueue(a)).toBe(false);
		expect(useQueueStore.getState().addToQueue(b)).toBe(false);
		expect(useQueueStore.getState().addToQueue(c)).toBe(true);
	});

	it('puts a track at the front for play next', () => {
		useQueueStore.getState().setQueue([a, b, c], 0);
		expect(useQueueStore.getState().playNext(d)).toBe(true);
		expect(useQueueStore.getState().queue.map(item => item.id)).toEqual(['d', 'b', 'c']);
		expect(useQueueStore.getState().playNext(d)).toBe(false);
	});

	it('restores the original order after a shuffle', () => {
		useQueueStore.getState().setQueue([a, b, c, d], 0);
		useQueueStore.getState().shuffleQueue();
		useQueueStore.getState().restoreQueue();
		expect(useQueueStore.getState().queue.map(item => item.id)).toEqual(['b', 'c', 'd']);
	});
});

describe('shuffledCopy', () => {
	it('keeps every item and leaves the input alone', () => {
		const input = [1, 2, 3, 4, 5];
		const output = shuffledCopy(input);
		expect(output).toHaveLength(input.length);
		expect([...output].sort()).toEqual([...input].sort());
		expect(input).toEqual([1, 2, 3, 4, 5]);
	});
});

describe('savedSummary', () => {
	it('counts tracks and sums bytes', () => {
		expect(savedSummary({})).toEqual({ count: 0, bytes: 0 });
		expect(savedSummary({ a: 100, b: 250 })).toEqual({ count: 2, bytes: 350 });
	});
});
