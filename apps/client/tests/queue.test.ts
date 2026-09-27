import { beforeEach, describe, expect, it } from 'vitest';

import type { Track } from '@/lib/api';
import { nextIndex, previousIndex, useQueueStore } from '@/store/queue.store';

/**
 * The queue's contract, and the bug it exists to prevent: the playing track
 * showing up twice. `nowPlaying()` and `upNext()` are views of one list, so a
 * duplicate is not representable — these tests pin that.
 */

function track(id: string): Track {
  return {
    id,
    title: `Track ${id}`,
    artist: { id: 'a', name: 'Artist' },
    album: { id: 'al', title: 'Album' },
    isDownloaded: false,
    isLiked: false,
    artworkUrl: `/api/tracks/${id}/artwork`,
  };
}

const queue = [track('1'), track('2'), track('3')];

beforeEach(() => {
  useQueueStore.getState().setQueue([]);
  useQueueStore.getState().setRepeat('off');
});

describe('queue', () => {
  it('never lists the playing track twice', () => {
    useQueueStore.getState().setQueue(queue, 0);

    const state = useQueueStore.getState();
    expect(state.nowPlaying()?.id).toBe('1');
    expect(state.upNext().map((item) => item.id)).toEqual(['2', '3']);
  });

  it('starts at the requested index', () => {
    useQueueStore.getState().setQueue(queue, 1);

    const state = useQueueStore.getState();
    expect(state.nowPlaying()?.id).toBe('2');
    expect(state.upNext().map((item) => item.id)).toEqual(['3']);
  });

  it('clamps a start index past the end', () => {
    useQueueStore.getState().setQueue(queue, 99);

    expect(useQueueStore.getState().nowPlaying()?.id).toBe('3');
  });

  it('inserts next without disturbing the cursor', () => {
    useQueueStore.getState().setQueue(queue, 0);
    useQueueStore.getState().enqueueNext(track('9'));

    expect(useQueueStore.getState().items.map((item) => item.id)).toEqual(['1', '9', '2', '3']);
    expect(useQueueStore.getState().nowPlaying()?.id).toBe('1');
  });

  it('shifts the cursor when an earlier track is removed, not the playing one', () => {
    useQueueStore.getState().setQueue(queue, 2);
    useQueueStore.getState().removeAt(0);

    const state = useQueueStore.getState();
    expect(state.items.map((item) => item.id)).toEqual(['2', '3']);
    // The playing track is still playing — this is the skip-a-track bug.
    expect(state.nowPlaying()?.id).toBe('3');
  });

  it('restores the original order when shuffle is switched off', () => {
    useQueueStore.getState().setQueue(queue, 1);
    useQueueStore.getState().toggleShuffle();

    expect(useQueueStore.getState().shuffle).toBe(true);
    expect(useQueueStore.getState().items).toHaveLength(3);
    // The playing track must not change just because the order did.
    expect(useQueueStore.getState().nowPlaying()?.id).toBe('2');

    useQueueStore.getState().toggleShuffle();

    expect(useQueueStore.getState().shuffle).toBe(false);
    expect(useQueueStore.getState().items.map((item) => item.id)).toEqual(['1', '2', '3']);
    expect(useQueueStore.getState().nowPlaying()?.id).toBe('2');
  });

  it('clears everything', () => {
    useQueueStore.getState().setQueue(queue, 1);
    useQueueStore.getState().clear();

    expect(useQueueStore.getState().nowPlaying()).toBeNull();
    expect(useQueueStore.getState().upNext()).toEqual([]);
  });
});

describe('next/previous index', () => {
  const at = (position: number, repeat: 'off' | 'one' | 'all' = 'off') => ({ items: queue, position, repeat });

  it('advances and wraps only when repeat is all', () => {
    expect(nextIndex(at(0))).toBe(1);
    expect(nextIndex(at(2))).toBeNull();
    expect(nextIndex(at(2, 'all'))).toBe(0);
  });

  it('repeats the same track when repeat is one', () => {
    // `next` with repeat-one still advances the queue: the element replays the
    // current track itself, so the queue does not have to model it twice.
    expect(previousIndex(at(1, 'one'))).toBe(1);
  });

  it('walks backwards and wraps only when repeat is all', () => {
    expect(previousIndex(at(2))).toBe(1);
    expect(previousIndex(at(0))).toBeNull();
    expect(previousIndex(at(0, 'all'))).toBe(2);
  });

  it('returns null on an empty queue rather than an invalid index', () => {
    expect(nextIndex({ items: [], position: -1, repeat: 'off' })).toBeNull();
    expect(previousIndex({ items: [], position: -1, repeat: 'off' })).toBeNull();
  });
});
