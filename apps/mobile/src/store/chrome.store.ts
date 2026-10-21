import { create } from 'zustand';

/**
 * Measurements of persistent chrome that other components position against.
 *
 * The floating tab bar's height depends on the device's bottom inset, so it
 * cannot be a constant. The tab bar measures itself once and writes the number
 * here; the mini player, which floats above it, reads it. Not persisted — it is
 * a fact about this launch's layout, not a preference.
 */
interface ChromeStore {
	tabBarHeight: number;
	setTabBarHeight: (height: number) => void;
}

export const useChromeStore = create<ChromeStore>(set => ({
	tabBarHeight: 0,
	setTabBarHeight: height =>
		set(state =>
			state.tabBarHeight === height ? state : { tabBarHeight: height }
		)
}));
