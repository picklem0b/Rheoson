import { api } from './client';
import { hasLyrics, parseLyrics, type Lyrics } from '@/lib/lyrics';
import { readLyricsFromDevice, saveLyricsToDevice } from '@/lib/lyricsCache';

export type { LyricLine, Lyrics } from '@/lib/lyrics';

const EMPTY: Lyrics = { plain: null, synced: null };

/**
 * Lyrics for a track, from the server when it answers and from the phone when
 * it cannot.
 *
 * The server reads a `.lrc` sidecar next to a downloaded file before it asks a
 * provider, so the words on the phone are the same ones a CLI download wrote —
 * and once fetched they are cached, which is what makes them available with no
 * connection at all.
 *
 * Failure is not an error state: a track whose lyrics do not exist returns
 * empty, and the UI says so plainly instead of offering a retry that will never
 * succeed.
 */
export const lyricsApi = {
	forTrack: async (trackId: string): Promise<Lyrics> => {
		if (!trackId) return EMPTY;
		try {
			const raw = await api.get<unknown>(`/lyrics/${trackId}`);
			const lyrics = parseLyrics(raw);
			if (hasLyrics(lyrics)) void saveLyricsToDevice(trackId, lyrics);
			return lyrics;
		} catch {
			// Offline, or the server is asleep. A saved track should still show
			// its words, and the cache is the only copy that exists down here.
			return (await readLyricsFromDevice(trackId)) ?? EMPTY;
		}
	}
};
