import { api } from './client';
import { normalizeTracks } from '@/lib/normalize';
import type { Track } from '@rheoson/api-types';

export interface HomeShelf {
	id: string;
	title: string;
	subtitle?: string;
	tracks: Track[];
}

/**
 * The Home shelves.
 *
 * One request builds the whole page: the recommendations service already knows
 * what to order and how much of each shelf to send, and a screen that fires
 * five separate requests to lay out one scroll is a screen that shows five
 * spinners.
 */
export const recommendationsApi = {
	home: async (): Promise<HomeShelf[]> => {
		const raw = await api.get<{ shelves?: HomeShelf[]; sections?: HomeShelf[] }>(
			'/recommendations/home'
		);
		const shelves = raw?.shelves ?? raw?.sections ?? [];
		return shelves.map(shelf => ({ ...shelf, tracks: normalizeTracks(shelf.tracks ?? []) }));
	},

	discover: async (): Promise<Track[]> =>
		normalizeTracks(await api.get('/recommendations/discover')),

	mixes: async (): Promise<HomeShelf[]> => {
		const raw = await api.get<{ mixes?: HomeShelf[] }>('/recommendations/mixes');
		return (raw?.mixes ?? []).map(mix => ({ ...mix, tracks: normalizeTracks(mix.tracks ?? []) }));
	},

	/** Endless radio seeded from a track — the "autoplay" rail's source. */
	radio: async (trackId: string): Promise<Track[]> =>
		normalizeTracks(await api.get('/recommendations/radio', { params: { trackId } })),

	autoplay: async (): Promise<Track[]> =>
		normalizeTracks(await api.get('/recommendations/autoplay')),

	taste: () => api.get<{ artists: string[]; genres: string[]; updatedAt?: string }>('/recommendations/taste'),

	refresh: () => api.post<{ ok: boolean }>('/recommendations/refresh')
};
