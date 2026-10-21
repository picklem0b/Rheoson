import type { ReactElement } from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { FloatingTabBar } from '@/components/layout/FloatingTabBar';
import { useDownloads } from '@/hooks/use-downloads';
import { useTheme } from '@/hooks/use-theme';

/**
 * The four rooms of the app.
 *
 * Home is what the server recommends, Search is how you find anything, Library
 * is what you own — favourites, playlists, albums, artists — and Downloads is
 * the transfer manager. Settings is not a tab: it lives behind the gear in the
 * Home header, because it is visited rarely and takes a seat content deserves.
 *
 * Four is the ceiling for a thumb-reachable bar (Miller, Fitts): each room has
 * a distinct job, and the floating capsule sits where the thumb already rests.
 * The mini player is not rendered here — `MiniPlayerDock` at the root floats it
 * above this bar on the tabs and at the screen edge everywhere else.
 */
export default function TabsLayout(): ReactElement {
	const { colour } = useTheme();
	// The badge is the only reason this lives here: a transfer started from
	// Home should be visible from every tab, and the count is the screen's own.
	const { active } = useDownloads();

	return (
		<View style={{ flex: 1, backgroundColor: colour.background }}>
			<Tabs
				tabBar={props => (
					<FloatingTabBar {...props} badges={{ downloads: active.length }} />
				)}
				screenOptions={{ headerShown: false, animation: 'fade' }}
			>
				<Tabs.Screen name='index' options={{ title: 'Home' }} />
				<Tabs.Screen name='search' options={{ title: 'Search' }} />
				<Tabs.Screen name='library' options={{ title: 'Library' }} />
				<Tabs.Screen name='downloads' options={{ title: 'Downloads' }} />
			</Tabs>
		</View>
	);
}
