/**
 * Every React Query key in one place.
 *
 * Keys used to be written inline at each call site, and two surfaces asking
 * the same question spelled them differently — the profile counted likes under
 * `['tracks', 'liked', 'count']` while the tray invalidated `['liked-count']`.
 * Liking a track from the player therefore refreshed nothing, and a count could
 * sit stale on a page the user was not looking at.
 *
 * A registry makes "who else is showing this?" answerable, which is what lets a
 * mutation refresh every surface that carries the data it changed.
 *
 * Keys are flat rather than nested where a prefix would collide: React Query
 * matches by key *prefix*, so `['tracks']` also matches `['tracks', 'liked']`.
 */

export const qk = {
  // ── Likes ──────────────────────────────────────────────────
  likedCount: () => ['liked-count'] as const,
  likedTracks: () => ['liked-tracks'] as const,

  // ── Library ────────────────────────────────────────────────
  libraryTracks: () => ['tracks'] as const,
  localTracks: () => ['tracks', 'local'] as const,
  libraryAlbums: () => ['library-albums'] as const,
  libraryArtists: () => ['library-artists'] as const,

  // ── Playlists ──────────────────────────────────────────────
  playlists: () => ['playlists'] as const,
  playlist: (id: string) => ['playlist', id] as const,
  /** Prefix for every playlist detail query. */
  playlistAll: () => ['playlist'] as const,

  // ── Listening ──────────────────────────────────────────────
  recentlyPlayed: () => ['recently-played'] as const,
  recentlyPlayedFull: () => ['recently-played-full'] as const,

  // ── Discovery ──────────────────────────────────────────────
  recommendations: () => ['recommendations'] as const,
  tasteProfile: () => ['taste', 'profile'] as const,
  analyticsStats: () => ['analytics', 'stats'] as const,

  // ── Artists ────────────────────────────────────────────────
  following: () => ['following'] as const,
  artistFollow: (id: string) => ['artist-follow', id] as const,

  // ── Track detail ───────────────────────────────────────────
  trackDownload: (trackId: string) => ['track', 'download', trackId] as const,
} as const

/**
 * Prefixes whose data is small, safe to keep on the device, and worth painting
 * before the server answers. Deliberately excludes anything large (library
 * listings, search results) and anything server-private beyond the signed-in
 * account's own summaries.
 */
export const SNAPSHOT_KEYS: readonly (readonly unknown[])[] = [
  qk.likedCount(),
  qk.playlists(),
  qk.recentlyPlayed(),
  qk.following(),
]

/** True when `key` is one of the snapshot-eligible queries (by prefix). */
export function isSnapshotKey(key: readonly unknown[]): boolean {
  return SNAPSHOT_KEYS.some(
    (prefix) => prefix.length <= key.length && prefix.every((part, i) => part === key[i])
  )
}
