import { create } from 'zustand';

import {
	clearSavedAudio,
	listSavedAudio,
	removeAudio,
	saveAudio
} from '@/lib/audioCache';
import { toast } from '@/store/toast.store';
import type { Track } from '@rheoson/api-types';

/**
 * Which tracks are saved on this phone, and which are being saved.
 *
 * Two maps rather than a set: the size is what Settings reports when it offers
 * to clear the cache, and the progress is what the button shows while a song is
 * coming down. Both are keyed by track id, which is stable across downloads
 * because the server's local ids are content-derived.
 *
 * `inFlight` prevents a double tap from starting two downloads of the same
 * file, which would race on the same `.part` path.
 */
interface OfflineStore {
	/** trackId → bytes. */
	saved: Record<string, number>;
	/** trackId → 0–1 while a save is running. */
	progress: Record<string, number>;
	ready: boolean;

	refresh: () => Promise<void>;
	save: (track: Track) => Promise<void>;
	remove: (trackId: string) => Promise<void>;
	clearAll: () => Promise<void>;
}

const inFlight = new Set<string>();

export const useOfflineStore = create<OfflineStore>((set, get) => ({
	saved: {},
	progress: {},
	ready: false,

	refresh: async () => {
		const list = await listSavedAudio();
		const saved: Record<string, number> = {};
		for (const item of list) saved[item.trackId] = item.bytes;
		set({ saved, ready: true });
	},

	save: async track => {
		if (inFlight.has(track.id) || get().saved[track.id] !== undefined) return;
		inFlight.add(track.id);
		set(state => ({ progress: { ...state.progress, [track.id]: 0 } }));

		const bytes = await saveAudio(track.id, fraction => {
			set(state => ({ progress: { ...state.progress, [track.id]: fraction } }));
		});

		inFlight.delete(track.id);
		set(state => {
			const progress = { ...state.progress };
			delete progress[track.id];
			if (bytes === null) return { progress };
			return { progress, saved: { ...state.saved, [track.id]: bytes } };
		});

		toast(bytes === null ? 'Could not save this track' : 'Kept on this device');
	},

	remove: async trackId => {
		await removeAudio(trackId);
		set(state => {
			const saved = { ...state.saved };
			delete saved[trackId];
			return { saved };
		});
		toast('Removed from this device');
	},

	clearAll: async () => {
		await clearSavedAudio();
		set({ saved: {}, progress: {} });
		toast('Saved audio cleared');
	}
}));

