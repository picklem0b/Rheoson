'use client';

import { create } from 'zustand';

import type { Track } from '@/lib/api';

/**
 * The queue — one list, one cursor.
 *
 * The rule that shapes this file: **the current track is part of the queue, and
 * appears exactly once.** The current stack's queue had a bug where the playing
 * track showed up twice — once as "now playing" and once as the first item of
 * "up next" — because those were computed from two different lists. Here
 * `nowPlaying()` is `items[position]`, and `upNext()` is everything after it,
 * so a duplicate is not representable.
 *
 * Shuffle is an **order**, not a flag: `shuffleTracks()` builds the order once,
 * so toggling shuffle off is a restore rather than a re-shuffle, and the
 * currently playing track does not jump.
 */

export type RepeatMode = 'off' | 'one' | 'all';

interface QueueState {
  /** The ordered queue. The playing track is `items[position]`. */
  items: Track[];
  /** Index of the current track, or -1 when nothing has started. */
  position: number;
  repeat: RepeatMode;
  shuffle: boolean;
  /** Where to return to when shuffle is switched off. */
  originalOrder: Track[] | null;

  setQueue: (tracks: Track[], startIndex?: number) => void;
  enqueue: (tracks: Track[]) => void;
  enqueueNext: (track: Track) => void;
  removeAt: (index: number) => void;
  clear: () => void;
  setPosition: (index: number) => void;
  setRepeat: (mode: RepeatMode) => void;
  toggleShuffle: () => void;

  /** The track that is playing, or null. */
  nowPlaying: () => Track | null;
  /** Everything after the current track, in play order. */
  upNext: () => Track[];
}

/** Fisher–Yates. Returns a new array; the input is never mutated. */
function shuffled(tracks: Track[]): Track[] {
  const copy = [...tracks];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  items: [],
  position: -1,
  repeat: 'off',
  shuffle: false,
  originalOrder: null,

  setQueue: (tracks, startIndex = 0) =>
    set({
      items: [...tracks],
      position: tracks.length === 0 ? -1 : Math.max(0, Math.min(startIndex, tracks.length - 1)),
      originalOrder: null,
    }),

  enqueue: (tracks) => {
    if (tracks.length === 0) return;
    const { items, position } = get();
    set({ items: [...items, ...tracks], position: items.length === 0 ? -1 : position });
  },

  enqueueNext: (track) => {
    const { items, position } = get();
    const next = [...items];
    next.splice(position + 1, 0, track);
    set({ items: next });
  },

  removeAt: (index) => {
    const { items, position } = get();
    if (index < 0 || index >= items.length) return;

    const next = items.filter((_, current) => current !== index);
    // Removing something *before* the cursor shifts it down by one; the cursor
    // itself stays put, so the playing track keeps playing.
    const shifted = index < position ? position - 1 : position;
    set({ items: next, position: Math.min(shifted, next.length - 1) });
  },

  clear: () => set({ items: [], position: -1, originalOrder: null }),

  setPosition: (index) => {
    const { items } = get();
    if (index < 0 || index >= items.length) return;
    set({ position: index });
  },

  setRepeat: (repeat) => set({ repeat }),

  toggleShuffle: () => {
    const { shuffle, items, position } = get();
    const current = items[position] ?? null;

    if (shuffle) {
      // Restore rather than re-derive: the listener's order is theirs.
      const original = get().originalOrder ?? items;
      const index = current ? original.findIndex((track) => track.id === current.id) : -1;
      set({ shuffle: false, items: original, position: index >= 0 ? index : position, originalOrder: null });
      return;
    }

    const order = shuffled(items);
    const index = current ? order.findIndex((track) => track.id === current.id) : -1;
    set({ shuffle: true, items: order, position: index >= 0 ? index : position, originalOrder: items });
  },

  nowPlaying: () => {
    const { items, position } = get();
    return position >= 0 ? (items[position] ?? null) : null;
  },

  upNext: () => {
    const { items, position } = get();
    return position < 0 ? items : items.slice(position + 1);
  },
}));

/** The next index to play, honouring repeat — the one place that decides. */
export function nextIndex(state: Pick<QueueState, 'items' | 'position' | 'repeat'>): number | null {
  const { items, position, repeat } = state;
  if (items.length === 0) return null;
  if (position + 1 < items.length) return position + 1;
  if (repeat === 'all') return 0;
  return null;
}

/** The previous index to play. `one` repeats the same track, like every player. */
export function previousIndex(state: Pick<QueueState, 'items' | 'position' | 'repeat'>): number | null {
  const { items, position, repeat } = state;
  if (items.length === 0) return null;
  if (repeat === 'one') return position;
  if (position - 1 >= 0) return position - 1;
  if (repeat === 'all') return items.length - 1;
  return null;
}
