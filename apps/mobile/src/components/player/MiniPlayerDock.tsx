import type { ReactElement } from 'react';
import { View } from 'react-native';
import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayer } from '@/components/player/MiniPlayer';
import { layout, spacing } from '@/constants/theme';
import { useChromeStore } from '@/store/chrome.store';

/**
 * Positions the mini player for whichever screen is showing.
 *
 * Mounted once at the root so playback follows you everywhere: above the tab
 * bar on the four tabs, at the bottom edge on album, artist, playlist, settings
 * and stats pages, and gone on the welcome screen and the full player, which has
 * its own controls. Which of those applies is read from the route segments, and
 * the tab bar's measured height (it depends on the device's bottom inset) comes
 * from the chrome store.
 */
export function MiniPlayerDock(): ReactElement | null {
	const segments = useSegments() as string[];
	const insets = useSafeAreaInsets();
	const tabBarHeight = useChromeStore(state => state.tabBarHeight);

	const top = segments[0];
	// No segments means the welcome route; the player is full-screen on its own.
	if (!top || top === 'player') return null;

	const inTabs = top === '(tabs)';
	const bottom = inTabs
		? tabBarHeight || layout.tabBar
		: Math.max(insets.bottom, spacing.md);

	return (
		<View
			pointerEvents='box-none'
			style={{ position: 'absolute', left: 0, right: 0, bottom }}
		>
			<MiniPlayer />
		</View>
	);
}
