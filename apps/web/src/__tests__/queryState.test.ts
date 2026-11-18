/**
 * Query-key registry, surface-wide invalidation, and the instant-paint
 * snapshot.
 *
 * The regression these exist for: the profile read a like count under one key
 * while the like tray invalidated another, so liking a track from the player
 * left the count stale on a page the user was not looking at.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { qk, isSnapshotKey } from '@/lib/queryKeys'
import {
  invalidateLikeSurfaces,
  invalidatePlaylistSurfaces,
  invalidateHistorySurfaces,
} from '@/lib/queryInvalidation'
import { activateSnapshot, clearSnapshots, hydrateSnapshot } from '@/lib/querySnapshot'

function invalidatedKeys(client: QueryClient, run: (c: QueryClient) => void): string[] {
  const spy = vi.spyOn(client, 'invalidateQueries')
  run(client)
  const keys = spy.mock.calls.map((call) => JSON.stringify((call[0] as { queryKey: unknown[] })?.queryKey))
  spy.mockRestore()
  return keys
}

describe('query key registry', () => {
  it('snapshots small account summaries and nothing larger', () => {
    expect(isSnapshotKey(qk.likedCount())).toBe(true)
    expect(isSnapshotKey(qk.playlists())).toBe(true)
    expect(isSnapshotKey(qk.recentlyPlayed())).toBe(true)

    // Library listings and search results can be large; not worth storing.
    expect(isSnapshotKey(qk.libraryTracks())).toBe(false)
    expect(isSnapshotKey(['search', 'categories'])).toBe(false)
    expect(isSnapshotKey(['health-snapshot'])).toBe(false)
  })
})

describe('invalidation covers every surface that shows the data', () => {
  it('refreshes the count key the profile reads when a like changes', () => {
    const keys = invalidatedKeys(new QueryClient(), invalidateLikeSurfaces)

    expect(keys).toContain(JSON.stringify(qk.likedCount()))
    expect(keys).toContain(JSON.stringify(qk.likedTracks()))
    expect(keys).toContain(JSON.stringify(qk.likedIds()))
    // Rows embed isLiked, so lists and shelves must re-read too.
    expect(keys).toContain(JSON.stringify(qk.libraryTracks()))
    expect(keys).toContain(JSON.stringify(qk.recommendations()))
    // Detail and chart surfaces render their own rows.
    expect(keys).toContain(JSON.stringify(qk.albumAll()))
    expect(keys).toContain(JSON.stringify(qk.artistAll()))
    expect(keys).toContain(JSON.stringify(qk.artistContentAll()))
    expect(keys).toContain(JSON.stringify(qk.trendingFull()))
    expect(keys).toContain(JSON.stringify(qk.categoryTopAll()))
    expect(keys).toContain(JSON.stringify(qk.playlistAll()))
  })

  it('refreshes both the playlist list and any open playlist', () => {
    const keys = invalidatedKeys(new QueryClient(), invalidatePlaylistSurfaces)

    expect(keys).toContain(JSON.stringify(qk.playlists()))
    expect(keys).toContain(JSON.stringify(qk.playlistAll()))
  })

  it('refreshes listening history and its stats', () => {
    const keys = invalidatedKeys(new QueryClient(), invalidateHistorySurfaces)

    expect(keys).toContain(JSON.stringify(qk.recentlyPlayed()))
    expect(keys).toContain(JSON.stringify(qk.analyticsStats()))
  })
})

describe('snapshot', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useRealTimers()
  })

  it('restores a remembered answer and revalidates it', () => {
    vi.useFakeTimers()
    const source = new QueryClient()
    const dispose = activateSnapshot(source, 'user_a')
    source.setQueryData(qk.likedCount(), 7)
    vi.advanceTimersByTime(500)
    dispose()
    vi.useRealTimers()

    const restored = new QueryClient()
    expect(hydrateSnapshot(restored, 'user_a')).toBe(1)
    expect(restored.getQueryData(qk.likedCount())).toBe(7)

    // Stamped as already-stale, so the fresh value still arrives.
    const state = restored.getQueryCache().find({ queryKey: qk.likedCount() })?.state
    expect(state?.dataUpdatedAt).toBeLessThan(Date.now())
  })

  it('never stores a query that is not on the whitelist', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    const dispose = activateSnapshot(client, 'user_a')
    client.setQueryData(qk.libraryTracks(), [{ id: 'x' }])
    client.setQueryData(['health-snapshot'], { internal: true })
    vi.advanceTimersByTime(500)
    dispose()
    vi.useRealTimers()

    expect(window.localStorage.getItem('rheoson:qs:user_a')).toBeNull()
  })

  it('ignores a snapshot older than the trust window', () => {
    const stale = Date.now() - 25 * 60 * 60 * 1000
    window.localStorage.setItem(
      'rheoson:qs:user_a',
      JSON.stringify({ [JSON.stringify(qk.likedCount())]: { data: 9, at: stale } })
    )

    const client = new QueryClient()
    expect(hydrateSnapshot(client, 'user_a')).toBe(0)
    expect(client.getQueryData(qk.likedCount())).toBeUndefined()
  })

  it('keeps accounts apart', () => {
    vi.useFakeTimers()
    const source = new QueryClient()
    const dispose = activateSnapshot(source, 'user_a')
    source.setQueryData(qk.likedCount(), 12)
    vi.advanceTimersByTime(500)
    dispose()
    vi.useRealTimers()

    const other = new QueryClient()
    expect(hydrateSnapshot(other, 'user_b')).toBe(0)
    expect(other.getQueryData(qk.likedCount())).toBeUndefined()
  })

  it('wipes every account on sign-out and leaves unrelated keys alone', () => {
    window.localStorage.setItem('rheoson:qs:user_a', '{}')
    window.localStorage.setItem('rheoson:qs:user_b', '{}')
    window.localStorage.setItem('rheoson:ui', 'keep-me')

    clearSnapshots()

    expect(window.localStorage.getItem('rheoson:qs:user_a')).toBeNull()
    expect(window.localStorage.getItem('rheoson:qs:user_b')).toBeNull()
    expect(window.localStorage.getItem('rheoson:ui')).toBe('keep-me')
  })
})
