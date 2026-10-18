import { api } from './client';
import { normalizeTrack, normalizeTracks } from '@/lib/normalize';
import type { Track } from '@rheoson/api-types';

export interface Playlist {
	id: string;
	title: string;
	description?: string;
	artworkUrl?: string;
	trackCount: number;
	createdAt?: string;
	tracks?: Track[];
}

/** Playlists. Storage is per-account on the server, so a guest's playlists are its own. */
export const playlistsApi = {
	list: async (): Promise<Playlist[]> => {
		const raw = await api.get<Playlist[]>('/playlists/');
		return Array.isArray(raw) ? raw : [];
	},

	get: async (id: string): Promise<Playlist> => {
		const raw = await api.get<Playlist & { tracks?: unknown[] }>(`/playlists/${id}`);
		return { ...raw, tracks: normalizeTracks(raw.tracks ?? []) };
	},

	create: (title: string, description?: string) =>
		api.post<Playlist>('/playlists/', { title, description }),

	rename: (id: string, title: string) => api.patch<Playlist>(`/playlists/${id}`, { title }),

	remove: (id: string) => api.delete(`/playlists/${id}`),

	addTrack: (id: string, trackId: string) =>
		api.post<Playlist>(`/playlists/${id}/tracks`, { trackIds: [trackId] }),

	removeTrack: (id: string, trackId: string) => api.delete(`/playlists/${id}/tracks/${trackId}`),

	reorder: (id: string, trackIds: string[]) =>
		api.put<Playlist>(`/playlists/${id}/tracks/reorder`, { trackIds }),

	/** Import from a public playlist URL (Spotify, YouTube Music, …). */
	importFromUrl: (url: string, title?: string) =>
		api.post<Playlist>('/playlists/import', { url, title }),

	/** One track, resolved — used by the share sheet's "open in app". */
	one: async (id: string): Promise<Track | null> => {
		try {
			return normalizeTrack(await api.get(`/tracks/${id}`));
		} catch {
			return null;
		}
	}
};
