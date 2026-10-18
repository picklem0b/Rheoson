/**
 * Every React Query key in one place.
 *
 * Keys used to be written inline at each call site, and two screens asking the
 * same question spelled them differently — a like made in the player refreshed
 * nothing, and a count sat stale on the profile. A registry makes "who else is
 * showing this?" answerable, which is what lets a mutation refresh every
 * surface that carries the data it changed.
 */
export const qk = {
	// ── Likes ──────────────────────────────────────────────────
	likedCount: () => ['liked-count'] as const,
	likedTracks: () => ['liked-tracks'] as const,
	likedIds: () => ['liked-ids'] as const,

	// ── Library ────────────────────────────────────────────────
	libraryTracks: () => ['tracks'] as const,
	localTracks: () => ['tracks', 'local'] as const,
	libraryAlbums: () => ['library-albums'] as const,
	libraryArtists: () => ['library-artists'] as const,

	// ── Playlists ──────────────────────────────────────────────
	playlists: () => ['playlists'] as const,
	playlist: (id: string) => ['playlist', id] as const,
	playlistAll: () => ['playlist'] as const,

	// ── Listening ──────────────────────────────────────────────
	recentlyPlayed: () => ['recently-played'] as const,
	recentlyPlayedFull: () => ['recently-played-full'] as const,
	analyticsStats: () => ['analytics', 'stats'] as const,
	wrapped: () => ['analytics', 'wrapped'] as const,

	// ── Discovery ──────────────────────────────────────────────
	home: () => ['recommendations', 'home'] as const,
	recommendations: () => ['recommendations'] as const,
	tasteProfile: () => ['taste', 'profile'] as const,
	featured: (limit: number) => ['featured', limit] as const,

	// ── Artists ────────────────────────────────────────────────
	following: () => ['following'] as const,
	artistFollow: (id: string) => ['artist-follow', id] as const,
	artist: (id: string) => ['artist', id] as const,
	artistAll: () => ['artist'] as const,

	// ── Albums and charts ─────────────────────────────────────
	album: (id: string) => ['album', id] as const,
	albumAll: () => ['album'] as const,
	trending: () => ['trending'] as const,
	trendingWeekly: () => ['trending-weekly'] as const,
	searchCategories: () => ['search', 'categories'] as const,
	categoryTop: (slug: string) => ['category-top', slug] as const,

	// ── Downloads ──────────────────────────────────────────────
	downloads: () => ['downloads'] as const,
	download: (id: string) => ['download', id] as const,

	// ── Lyrics and messages ────────────────────────────────────
	lyrics: (trackId: string) => ['lyrics', trackId] as const,
	messagingConversations: () => ['messaging-conversations'] as const,
	messagingMessages: (peerId: string) => ['messaging-messages', peerId] as const,
	messagingMessagesAll: () => ['messaging-messages'] as const,
	blends: () => ['blends'] as const,
	blend: (id: string) => ['blend', id] as const
} as const;

/**
 * Sections mirrored into the offline cache, and which query key each one
 * restores. These are the listings worth having with no signal: the music the
 * user chose, in the order they chose it.
 */
export const OFFLINE_SECTIONS: ReadonlyArray<readonly [readonly unknown[], string]> = [
	[qk.likedTracks(), 'liked'] as const,
	[qk.recentlyPlayedFull(), 'history'] as const,
	[qk.playlists(), 'playlists'] as const,
	[qk.following(), 'following'] as const,
	[qk.libraryTracks(), 'library'] as const,
	[qk.libraryAlbums(), 'albums'] as const,
	[qk.libraryArtists(), 'artists'] as const
];
