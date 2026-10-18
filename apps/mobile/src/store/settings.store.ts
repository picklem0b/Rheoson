import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Preferences that belong to this device.
 *
 * Everything here has a live consumer — a switch that changes nothing is a
 * lie, so the list stays short on purpose. Server-synced preferences (the ones
 * that follow an account between devices) live on the API instead; this store
 * is only for choices that are genuinely about this phone.
 */
interface SettingsStore {
	/** 'system' follows the OS appearance. */
	theme: 'system' | 'dark' | 'light';
	/** Show the persisted track on launch without starting playback. */
	resumeOnLaunch: boolean;
	/** Autoplay the next track when one ends. */
	autoplay: boolean;
	/** Keep the screen on while music plays. */
	keepAwake: boolean;
	haptics: boolean;
	/** Refuse downloads while on cellular. */
	wifiOnlyDownloads: boolean;
	/** Warm the next tracks' streams before they are needed. */
	warmAhead: boolean;
	/** Chart region, which changes what "trending" means. */
	region: string;
	/** Search history, newest first, capped. */
	recentSearches: string[];

	setTheme: (theme: SettingsStore['theme']) => void;
	set: <K extends keyof SettingsStore>(key: K, value: SettingsStore[K]) => void;
	rememberSearch: (term: string) => void;
	clearSearches: () => void;
}

const MAX_RECENT_SEARCHES = 12;

export const useSettingsStore = create<SettingsStore>()(
	persist(
		set => ({
			theme: 'system',
			resumeOnLaunch: true,
			autoplay: true,
			keepAwake: true,
			haptics: true,
			wifiOnlyDownloads: false,
			warmAhead: true,
			region: 'ZA',
			recentSearches: [],

			setTheme: theme => set({ theme }),

			set: (key, value) => set({ [key]: value } as Partial<SettingsStore>),

			rememberSearch: term =>
				set(state => {
					const trimmed = term.trim();
					if (!trimmed) return state;
					return {
						recentSearches: [
							trimmed,
							...state.recentSearches.filter(item => item !== trimmed)
						].slice(0, MAX_RECENT_SEARCHES)
					};
				}),

			clearSearches: () => set({ recentSearches: [] })
		}),
		{
			name: 'rheoson-settings',
			storage: createJSONStorage(() => AsyncStorage)
		}
	)
);
