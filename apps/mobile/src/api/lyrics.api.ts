import { api } from './client';

export interface LyricLine {
	/** Seconds into the track, when the provider supplies timing. */
	startTime?: number;
	text: string;
}

export interface Lyrics {
	/** Plain lyric text, or null when nothing was found. */
	plain: string | null;
	/** Timed lines, when the provider had them. */
	synced: LyricLine[] | null;
	source?: string;
}

const EMPTY: Lyrics = { plain: null, synced: null };

/**
 * Lyrics.
 *
 * The server fetches from a provider and caches the result, so this is a
 * cheap call to repeat. Failure is not an error state: a track whose lyrics
 * simply do not exist returns empty, and the UI says "no lyrics yet" instead
 * of showing a retry button for something that will never succeed.
 */
export const lyricsApi = {
	forTrack: async (trackId: string): Promise<Lyrics> => {
		try {
			const raw = await api.get<{
				plain?: string | null;
				synced?: LyricLine[] | null;
				source?: string;
				lyrics?: string | null;
			}>(`/lyrics/${trackId}`);
			return {
				plain: raw?.plain ?? raw?.lyrics ?? null,
				synced: Array.isArray(raw?.synced) ? raw.synced : null,
				source: raw?.source
			};
		} catch {
			return EMPTY;
		}
	}
};
