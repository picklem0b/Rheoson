import { api } from './client';
import { normalizeTracks } from '@/lib/normalize';
import type { Track } from '@rheoson/api-types';

export interface SearchResult {
	tracks: Track[];
	albums: { id: string; title: string; artworkUrl?: string; artist?: string }[];
	artists: { id: string; name: string; imageUrl?: string }[];
	playlists: { id: string; title: string; artworkUrl?: string; trackCount?: number }[];
}

export interface SearchCategory {
	slug: string;
	title: string;
}

const EMPTY: SearchResult = { tracks: [], albums: [], artists: [], playlists: [] };

/**
 * Search.
 *
 * The shape is normalised here rather than in the screen: the API returns four
 * rails and any of them may be missing, and a search screen that has to guard
 * every access is a search screen that renders a blank page when one rail
 * changes name.
 */
export const searchApi = {
	query: async (term: string, limit = 20): Promise<SearchResult> => {
		const trimmed = term.trim();
		if (!trimmed) return EMPTY;
		const raw = await api.get<Partial<SearchResult>>('/search', {
			params: { q: trimmed, limit }
		});
		return {
			tracks: normalizeTracks(raw?.tracks ?? []),
			albums: raw?.albums ?? [],
			artists: raw?.artists ?? [],
			playlists: raw?.playlists ?? []
		};
	},

	categories: () => api.get<SearchCategory[]>('/search/categories'),

	categoryTop: async (slug: string, limit = 20): Promise<Track[]> =>
		normalizeTracks(await api.get('/search/categories/' + slug + '/top', { params: { limit } }))
};
