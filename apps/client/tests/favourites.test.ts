import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { useFavouritesStore } from '@/store/favourites.store';
import { usePopupStore } from '@/store/popup.store';
import { useToastStore } from '@/store/toast.store';

/**
 * A like is optimistic and reversible. These tests pin both halves: the heart
 * flips before the server answers (so it feels instant), and a rejection puts
 * it back with a coded popup (so it never lies quietly).
 */

const like = vi.fn();
const unlike = vi.fn();
const likes = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: {
      like: (trackId: string) => like(trackId),
      unlike: (trackId: string) => unlike(trackId),
      likes: (limit?: number) => likes(limit),
    },
  };
});

describe('favourites store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFavouritesStore.setState({ liked: {}, loaded: false });
    useToastStore.setState({ toasts: [] });
    usePopupStore.getState().close();
  });

  it('adds a track optimistically and keeps it on success', async () => {
    like.mockResolvedValueOnce({ liked: true });
    const promise = useFavouritesStore.getState().toggle('track_1', 'A Song');

    // The heart is already on before the request resolves.
    expect(useFavouritesStore.getState().liked['track_1']).toBe(true);

    await expect(promise).resolves.toBe(true);
    expect(like).toHaveBeenCalledWith('track_1');
    expect(useFavouritesStore.getState().liked['track_1']).toBe(true);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ kind: 'success' });
  });

  it('removes a track optimistically and keeps it removed on success', async () => {
    useFavouritesStore.setState({ liked: { track_1: true } });
    unlike.mockResolvedValueOnce({ liked: false });

    await useFavouritesStore.getState().toggle('track_1');

    expect(unlike).toHaveBeenCalledWith('track_1');
    expect(useFavouritesStore.getState().liked['track_1']).toBeUndefined();
  });

  it('reverts a failed like and explains it with the registry code', async () => {
    unlike.mockResolvedValueOnce({ liked: false });
    like.mockRejectedValueOnce(new ApiError(500, { code: 'TEX01', error: 'Could not update the like' }));

    await useFavouritesStore.getState().toggle('track_1');

    expect(useFavouritesStore.getState().liked['track_1']).toBeUndefined();
    const failure = usePopupStore.getState().popup;
    expect(failure?.kind).toBe('error');
    expect(failure?.code).toBe('TEX01');
    expect(failure?.detail).toContain('TEX01');
  });

  it('falls back to the registry code when the failure carries none', async () => {
    like.mockRejectedValueOnce(new Error('network down'));

    await useFavouritesStore.getState().toggle('track_1');

    // An uncoded failure is still traceable rather than a blank red box.
    expect(usePopupStore.getState().popup?.code).toBe('TEX01');
  });

  it('loads the server list once and does not re-fetch on every call', async () => {
    likes.mockResolvedValue({ trackIds: ['a', 'b'], total: 2 });

    await useFavouritesStore.getState().load();
    await useFavouritesStore.getState().load();

    expect(likes).toHaveBeenCalledTimes(1);
    expect(Object.keys(useFavouritesStore.getState().liked).sort()).toEqual(['a', 'b']);
  });

  it('stays unloaded when the read fails, so a retry is possible', async () => {
    likes.mockRejectedValueOnce(new ApiError(503, { code: 'SUP02' }));

    await useFavouritesStore.getState().load();

    expect(useFavouritesStore.getState().loaded).toBe(false);
  });
});
