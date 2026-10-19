import { create } from 'zustand';

import type { Track } from '@rheoson/api-types';

/**
 * Which track the long-press menu is about.
 *
 * Every row in the app can open the same menu, and none of them should have to
 * carry six callbacks to do it. The trigger pushes a target here, one `<TrackMenu
 * />` at the root renders it, and the row stays a row.
 *
 * `playlistId` is the one piece of context the menu needs: inside a playlist,
 * "Remove from this playlist" only means something if the menu knows which
 * playlist it was opened from.
 */
export interface TrackMenuTarget {
	track: Track;
	playlistId?: string;
}

interface SheetStore {
	trackMenu: TrackMenuTarget | null;
	openTrackMenu: (target: TrackMenuTarget) => void;
	closeTrackMenu: () => void;
}

export const useSheetStore = create<SheetStore>(set => ({
	trackMenu: null,
	openTrackMenu: target => set({ trackMenu: target }),
	closeTrackMenu: () => set({ trackMenu: null })
}));

/** Open the menu from any event handler. */
export function openTrackMenu(track: Track, playlistId?: string): void {
	useSheetStore.getState().openTrackMenu({ track, playlistId });
}
