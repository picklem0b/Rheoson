import { create } from 'zustand';

/**
 * A sentence at the bottom of the screen, for one moment.
 *
 * Every action that completes without changing the page needs an answer —
 * "Added to queue", "Download started", "Removed from playlist". An `Alert`
 * would stop playback to say so, which is why this exists: it is dismissible by
 * doing nothing, and it never blocks the transport.
 *
 * The timer lives in the store rather than the component so a second toast
 * replaces the first instead of stacking two timers that hide each other early.
 */
interface ToastStore {
	message: string | null;
	show: (message: string) => void;
	hide: () => void;
}

const VISIBLE_MS = 2_400;

let timer: ReturnType<typeof setTimeout> | undefined;

export const useToastStore = create<ToastStore>(set => ({
	message: null,

	show: message => {
		if (timer) clearTimeout(timer);
		set({ message });
		timer = setTimeout(() => set({ message: null }), VISIBLE_MS);
	},

	hide: () => {
		if (timer) clearTimeout(timer);
		set({ message: null });
	}
}));

/** Call from anywhere — hooks, stores, event handlers. */
export function toast(message: string): void {
	useToastStore.getState().show(message);
}
