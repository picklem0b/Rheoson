import { api } from './client';
import { normalizeAlbum, normalizeArtist } from '@/lib/normalize';
import type { Album, Artist } from '@rheoson/api-types';

export interface FollowedArtist {
	id: string;
	name: string;
	imageUrl: string;
	monthlyListeners: number;
	latestRelease: {
		id: string;
		title: string;
		artworkUrl: string;
		releaseYear: number;
		type: 'album' | 'single';
	} | null;
	followedAt: string;
}

export interface FeaturedItem {
	id: string;
	title: string;
	subtitle?: string;
	artworkUrl?: string;
	type: 'playlist' | 'album';
}

/** Albums, artists and follows — the library's skeletons. */
export const libraryApi = {
	albums: async (): Promise<Album[]> => {
		const raw = await api.get<unknown[]>('/library/albums');
		return Array.isArray(raw) ? raw.map(normalizeAlbum) : [];
	},

	album: async (id: string): Promise<Album> =>
		normalizeAlbum(await api.get(`/library/albums/${id}`)),

	artists: async (): Promise<Artist[]> => {
		const raw = await api.get<unknown[]>('/library/artists');
		return Array.isArray(raw) ? raw.map(normalizeArtist) : [];
	},

	/** Artist profile + top songs; browses upstream when not downloaded locally. */
	artist: async (id: string): Promise<Artist> => normalizeArtist(await api.get(`/artists/${id}`)),

	featured: (limit = 10) => api.get<FeaturedItem[]>('/library/featured', { params: { limit } }),

	following: async (): Promise<FollowedArtist[]> => {
		const raw = await api.get<{ artists?: FollowedArtist[] }>('/artists/following');
		return Array.isArray(raw?.artists) ? raw.artists : [];
	},

	isFollowing: (artistId: string) =>
		api.get<{ isFollowing: boolean }>(`/artists/${artistId}/status`),

	follow: (artistId: string, meta: { name?: string; imageUrl?: string } = {}) =>
		api.post(`/artists/${artistId}/follow`, meta),

	unfollow: (artistId: string) => api.delete(`/artists/${artistId}/follow`)
};
