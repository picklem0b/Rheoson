import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect, useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, ErrorState, Text, Toaster } from '@/components/ui';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { useTheme } from '@/hooks/use-theme';
import { MiniPlayerDock } from '@/components/player/MiniPlayerDock';
import { TrackMenu } from '@/components/track/TrackMenu';
import { useKeepAwakeWhilePlaying } from '@/hooks/use-keep-awake';
import { usePlayback } from '@/hooks/use-playback';
import { useOfflineMirror } from '@/hooks/use-offline-mirror';
import { queryClient } from '@/lib/queryClient';
import { captureCrash, flushCrashes } from '@/services/crash';
import { setupPlayer } from '@/services/player';
import { useOfflineStore } from '@/store/offline.store';
import { ensureSession, getSessionSub } from '@/services/session';

/**
 * Root of the app.
 *
 * Four things happen here and nowhere else, because each must exist exactly
 * once per launch: the audio engine and its playback bridge are mounted, the
 * device's session is established (a guest identity, so the first screen is
 * never a sign-in wall), the offline mirror is wired to the query cache, and
 * the two global overlays — the track sheet and the toast — are rendered.
 *
 * The mini player is positioned by `MiniPlayerDock`, which reads the route: it
 * floats above the tab bar on the tabs, sits at the screen edge on detail pages,
 * and steps aside for the full player and the welcome screen.
 */
export default function RootLayout(): ReactElement {
	const [account, setAccount] = useState<string | null>(null);
	const { colour } = useTheme();

	// Mounted once: installs the engine listeners, keeps the native queue in
	// step, and restores the last track after the stores rehydrate.
	usePlayback();
	useKeepAwakeWhilePlaying();

	useEffect(() => {
		void setupPlayer();
		void ensureSession().then(() => getSessionSub().then(setAccount));
		void flushCrashes();
		// Build the index of tracks saved on this phone before the player asks.
		void useOfflineStore.getState().refresh();
	}, []);

	useOfflineMirror(account);

	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider>
				<GestureHandlerRootView style={{ flex: 1 }}>
					<SafeAreaProvider>
						<View style={{ flex: 1 }}>
							<Stack
								screenOptions={{
									headerShown: false,
									// A route that is still mounting must never flash white
									// (or black, in light mode) between two screens.
									contentStyle: { backgroundColor: colour.background },
									animation: 'slide_from_right',
									animationDuration: 280,
									gestureEnabled: true
								}}
							>
								<Stack.Screen name='index' options={{ animation: 'fade' }} />
								<Stack.Screen
									name='(tabs)'
									options={{ animation: 'fade', gestureEnabled: false }}
								/>
								<Stack.Screen
									name='player'
									options={{
										presentation: 'modal',
										animation: 'slide_from_bottom',
										gestureDirection: 'vertical'
									}}
								/>
								<Stack.Screen name='settings' />
								<Stack.Screen name='stats' />
								<Stack.Screen name='album/[id]' />
								<Stack.Screen name='artist/[id]' />
								<Stack.Screen name='playlist/[id]' />
							</Stack>
							<MiniPlayerDock />
							<TrackMenu />
							<Toaster />
						</View>
					</SafeAreaProvider>
				</GestureHandlerRootView>
			</ThemeProvider>
		</QueryClientProvider>
	);
}

/**
 * Boundary for every route below the root.
 *
 * expo-router wraps a route in this when the module exports it, so one here
 * covers every screen: a render failure becomes a readable message with a retry
 * instead of a blank window. The failure is also reported, because a crash on a
 * phone that is never connected is a bug nobody would otherwise hear about.
 */
export function ErrorBoundary({
	error,
	retry
}: ErrorBoundaryProps): ReactElement {
	useEffect(() => {
		void captureCrash(error, 'render');
	}, [error]);

	return (
		<SafeAreaProvider>
			<ThemeProvider>
				<ErrorState
					message={error.message || 'Something went wrong'}
					onRetry={() => void retry()}
				/>
			</ThemeProvider>
		</SafeAreaProvider>
	);
}

export { Button, Text };
