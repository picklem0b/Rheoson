import type { ReactElement } from 'react';
import { Tabs } from 'expo-router';
import {
	DownloadSimpleIcon,
	HouseIcon,
	MagnifyingGlassIcon,
	MusicNotesIcon
} from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { MiniPlayer } from '@/components/player/MiniPlayer';
import { layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The four rooms of the app.
 *
 * Home is what the server recommends, Search is how you find anything, Library
 * is what you own — favourites, playlists, albums, artists, downloads — and
 * Downloads is the transfer manager. Settings is not a tab: it lives behind the
 * avatar in the Home header, because it is visited rarely and takes a seat that
 * content deserves.
 */
export default function TabsLayout(): ReactElement {
	const { colour } = useTheme();

	return (
		<View style={{ flex: 1, backgroundColor: colour.background }}>
			<Tabs
				screenOptions={{
					headerShown: false,
					tabBarActiveTintColor: colour.accent,
					tabBarInactiveTintColor: colour.textMuted,
					tabBarStyle: {
						backgroundColor: colour.background,
						borderTopColor: colour.border,
						borderTopWidth: StyleSheet.hairlineWidth,
						height: layout.tabBar,
						paddingTop: 4
					},
					tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }
				}}
			>
				<Tabs.Screen
					name='index'
					options={{
						title: 'Home',
						tabBarIcon: ({ color, size, focused }) => (
							<HouseIcon size={size} color={color} weight={focused ? 'fill' : 'regular'} />
						)
					}}
				/>
				<Tabs.Screen
					name='search'
					options={{
						title: 'Search',
						tabBarIcon: ({ color, size, focused }) => (
							<MagnifyingGlassIcon size={size} color={color} weight={focused ? 'bold' : 'regular'} />
						)
					}}
				/>
				<Tabs.Screen
					name='library'
					options={{
						title: 'Library',
						tabBarIcon: ({ color, size, focused }) => (
							<MusicNotesIcon size={size} color={color} weight={focused ? 'fill' : 'regular'} />
						)
					}}
				/>
				<Tabs.Screen
					name='downloads'
					options={{
						title: 'Downloads',
						tabBarIcon: ({ color, size, focused }) => (
							<DownloadSimpleIcon size={size} color={color} weight={focused ? 'fill' : 'regular'} />
						)
					}}
				/>
			</Tabs>
			<View style={{ position: 'absolute', left: 0, right: 0, bottom: layout.tabBar }}>
				<MiniPlayer />
			</View>
		</View>
	);
}
