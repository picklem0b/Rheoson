'use client';

import { create } from 'zustand';

import { ApiError, api } from '@/lib/api';

import { toast } from './toast.store';

/**
 * Favourites — one set, every heart.
 *
 * A like is a fact about the account, so it cannot live in a component's local
 * state: the same track is drawn by a library row, a search result and the
 * player bar, and a heart that only updates where it was clicked is the bug
 * that makes people click twice.
 *
 * Two rules:
 *
 * * **Optimistic, then honest.** The heart flips immediately because that is
 *   what the user meant, and reverts with a coded error toast if the server
 *   disagrees. A silent revert would be worse than a delay.
 * * **Errors carry the registry code** (`TEX01` is "could not update the
 *   like"), so the same failure reads the same way wherever it happens.
 */

interface FavouritesState {
  /** Track id → true. A record rather than a `Set` so the state is plain. */
  liked: Record<string, true>;
  /** True once the server list has been read; a fetch failure stays false. */
  loaded: boolean;
  load: () => Promise<void>;
  toggle: (trackId: string, title?: string) => Promise<boolean>;
}

function withId(current: Record<string, true>, trackId: string, liked: boolean): Record<string, true> {
  if (!liked) {
    const next = { ...current };
    delete next[trackId];
    return next;
  }
  return { ...current, [trackId]: true };
}

export const useFavouritesStore = create<FavouritesState>((set, get) => ({
  liked: {},
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const { trackIds } = await api.likes(1000);
      set({ liked: Object.fromEntries(trackIds.map((id) => [id, true] as const)), loaded: true });
    } catch {
      // Not loaded stays not loaded: the per-track `isLiked` from the API is
      // still correct, so a heart is never wrong — it is only uninformed about
      // likes this session did not make.
    }
  },

  toggle: async (trackId, title) => {
    const before = Boolean(get().liked[trackId]);
    const after = !before;

    set((state) => ({ liked: withId(state.liked, trackId, after) }));
    set({ loaded: true });

    try {
      if (after) await api.like(trackId);
      else await api.unlike(trackId);
      toast.success(after ? 'Added to favourites' : 'Removed from favourites', title);
      return after;
    } catch (error) {
      set((state) => ({ liked: withId(state.liked, trackId, before) }));
      const apiError = error instanceof ApiError ? error : null;
      toast.error({
        title: 'Could not update your favourites',
        code: apiError?.code ?? 'TEX01',
        detail: apiError?.explanation ?? 'The change was not saved — try again.',
      });
      return before;
    }
  },
}));
