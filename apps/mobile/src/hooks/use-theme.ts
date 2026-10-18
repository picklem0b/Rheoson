import { useColorScheme } from 'react-native';

import { themes, type ThemeColors } from '@/constants/theme';
import { useSettingsStore } from '@/store/settings.store';

/**
 * The active palette.
 *
 * 'system' follows the OS so the app matches whatever the phone is set to,
 * including a scheduled dark mode; an explicit choice overrides it. Reading the
 * scheme through a hook (not a module constant) is what makes a theme change
 * repaint every screen instead of only the one that triggered it.
 */
export function useTheme(): { colour: ThemeColors; scheme: 'light' | 'dark' } {
	const preference = useSettingsStore(state => state.theme);
	const system = useColorScheme();

	const scheme = preference === 'system' ? (system ?? 'dark') : preference;
	return { colour: themes[scheme], scheme };
}
