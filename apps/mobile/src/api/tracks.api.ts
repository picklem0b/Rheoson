import { api, mediaUrl } from './client';
import { normalizeTrack, normalizeTracks } from '@/lib/normalize';
import type { Track } from '@rheoson/api-types';

/**
 * Tracks: the library, likes, history and play reporting.
 *
 * Every response goes through `normalize` before it reaches a component —
 * the backend can legitimately send a null artist or a string duration, and a
 * row that renders "undefined" is a worse bug than a slightly slower render.
 */
export const tracksApi = {
	list: async (): Promise<Track[]> => normalizeTracks(await api.get('/tracks/')),

	get: async (id: string): Promise<Track | null> => {
		try {
			return normalizeTrack(await api.get(`/tracks/${id}`));
		} catch {
			return null;
		}
	},

	liked: async (): Promise<Track[]> => normalizeTracks(await api.get('/tracks/liked')),

	likedIds: async (): Promise<string[]> => {
		const raw = await api.get<Track[]>('/tracks/liked');
		return normalizeTracks(raw).map(track => track.id);
	},

	likedCount: async (): Promise<number> => {
		const raw = await api.get<{ count?: number }>('/tracks/liked/count');
		return typeof raw?.count === 'number' ? raw.count : 0;
	},

	like: (id: string) => api.post(`/tracks/${id}/like`),
	unlike: (id: string) => api.delete(`/tracks/${id}/like`),

	dislike: (id: string) => api.post(`/tracks/${id}/dislike`),
	undislike: (id: string) => api.delete(`/tracks/${id}/dislike`),

	recentlyPlayed: async (limit = 20): Promise<Track[]> =>
		normalizeTracks(await api.get('/tracks/recently-played', { params: { limit } })),

	/** Record a play. Fire-and-forget: history must never block playback. */
	recordPlay: (id: string) => api.post(`/tracks/${id}/play`, undefined),

	clearHistory: () => api.delete('/tracks/history'),

	trending: async (limit = 10): Promise<Track[]> =>
		normalizeTracks(await api.get('/tracks/trending', { params: { limit } })),

	trendingWeekly: async (limit = 10): Promise<Track[]> =>
		normalizeTracks(await api.get('/tracks/trending/weekly', { params: { limit } })),

	/**
	 * The stream URL the player loads.
	 *
	 * Range requests are answered by the server, so seeking works without
	 * downloading anything first; `mediaUrl` keeps this absolute because a
	 * native player has no page origin to resolve a relative path against.
	 */
	streamUrl: (id: string) => mediaUrl(`/stream/${id}/audio`),
	artworkUrl: (id: string) => mediaUrl(`/stream/${id}/artwork`),

	/** Ask the server to warm its cache for a track that is coming up. */
	warm: (id: string) => api.post(`/stream/${id}/warm`, undefined)
};

export const {
	list,
	get,
	liked,
	likedCount,
	like,
	unlike,
	recentlyPlayed,
	recordPlay,
	trending,
	trendingWeekly,
	streamUrl,
	artworkUrl
} = tracksApi;
