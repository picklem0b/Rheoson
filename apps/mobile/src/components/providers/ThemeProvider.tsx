import type { ReactElement, ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * Applies the active palette to everything inside it.
 *
 * React Native has no cascade, so "the theme" is not ambient: without a wrapper
 * that paints the background and sets the status bar, a light-mode user would
 * see a white screen with a black status bar and a flash of the wrong colour
 * whenever a screen mounted.
 */
export function ThemeProvider({ children }: { children: ReactNode }): ReactElement {
	const { colour, scheme } = useTheme();
	return (
		<View style={{ flex: 1, backgroundColor: colour.background }}>
			<StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
			{children}
		</View>
	);
}
