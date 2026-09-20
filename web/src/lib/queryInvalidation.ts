/**
 * Surface-wide cache invalidation.
 *
 * A mutation knows what it changed, not which components happen to be mounted.
 * These helpers answer the second half: after a like, every query that carries
 * `isLiked` or a like count is refreshed — the profile's counter, the liked
 * list, library rows, history rows and recommendation shelves — whether or not
 * the user is currently looking at them. React Query then re-renders only the
 * components that consume the changed data, so nothing restarts and no page
 * reloads.
 */

import type { QueryClient } from '@tanstack/react-query'
import { qk } from './queryKeys'

function invalidate(client: QueryClient, key: readonly unknown[]): void {
  void client.invalidateQueries({ queryKey: key })
}

/** Call after liking or unliking a track. */
export function invalidateLikeSurfaces(client: QueryClient): void {
  invalidate(client, qk.likedCount())
  invalidate(client, qk.likedTracks())
  // Track rows embed isLiked, so every list that renders a heart is affected.
  invalidate(client, qk.libraryTracks())
  invalidate(client, qk.recentlyPlayed())
  invalidate(client, qk.recentlyPlayedFull())
  invalidate(client, qk.recommendations())
  invalidate(client, qk.tasteProfile())
}

/** Call after creating, renaming, deleting or re-ordering a playlist. */
export function invalidatePlaylistSurfaces(client: QueryClient): void {
  invalidate(client, qk.playlists())
  invalidate(client, qk.playlistAll())
}

/** Call after a track is added to a playlist. */
export function invalidatePlaylistTrackSurfaces(client: QueryClient, playlistId: string): void {
  invalidate(client, qk.playlists())
  invalidate(client, qk.playlist(playlistId))
}

/** Call after recording a play. */
export function invalidateHistorySurfaces(client: QueryClient): void {
  invalidate(client, qk.recentlyPlayed())
  invalidate(client, qk.recentlyPlayedFull())
  invalidate(client, qk.analyticsStats())
}

/** Call after following or unfollowing an artist. */
export function invalidateArtistFollowSurfaces(client: QueryClient, artistId: string): void {
  invalidate(client, qk.artistFollow(artistId))
  invalidate(client, qk.following())
}
