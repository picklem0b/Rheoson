import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MiniPlayer } from '@/components/player/MiniPlayer';
import { Button, ErrorState, Text } from '@/components/ui';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { usePlayback } from '@/hooks/use-playback';
import { useOfflineMirror } from '@/hooks/use-offline-mirror';
import { captureCrash, flushCrashes } from '@/services/crash';
import { setupPlayer } from '@/services/player';
import { ensureSession, getSessionSub } from '@/services/session';

/**
 * Root of the app.
 *
 * Three things happen here and nowhere else, because each of them must exist
 * exactly once per launch: the audio engine is initialised, the device's
 * session is established (a guest identity, so the first screen is never a
 * sign-in wall), and the offline mirror is wired to the query cache.
 *
 * The player bar is rendered by the tabs layout rather than here: a full-screen
 * route like the player itself should not sit above a bar that duplicates its
 * own controls.
 */
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// A phone changes networks constantly; retrying a dead request three
			// times costs battery and shows nothing.
			retry: 1,
			staleTime: 30_000,
			refetchOnWindowFocus: false
		}
	}
});

export default function RootLayout(): ReactElement {
	const [account, setAccount] = useState<string | null>(null);

	useEngine();

	useEffect(() => {
		void ensureSession().then(() => getSessionSub().then(setAccount));
		void flushCrashes();
	}, []);

	useOfflineMirror(account);

	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider>
				<GestureHandlerRootView style={{ flex: 1 }}>
					<SafeAreaProvider>
						<StatusBar style='auto' />
						<Stack screenOptions={{ headerShown: false }}>
							<Stack.Screen name='index' />
							<Stack.Screen name='(tabs)' />
							<Stack.Screen name='player' options={{ presentation: 'modal' }} />
						</Stack>
					</SafeAreaProvider>
				</GestureHandlerRootView>
			</ThemeProvider>
		</QueryClientProvider>
	);
}

/** The audio engine, mounted once so its store subscriptions stay alive. */
function useEngine(): void {
	const { playTrack } = usePlayback();
	void playTrack;
	useEffect(() => {
		void setupPlayer();
	}, []);
}

/**
 * Boundary for every route below the root.
 *
 * expo-router wraps a route in this when the module exports it, so one here
 * covers every screen: a render failure becomes a readable message with a retry
 * instead of a blank window. The failure is also reported, because a crash on a
 * phone that is never connected is a bug nobody would otherwise hear about.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps): ReactElement {
	useEffect(() => {
		void captureCrash(error, 'render');
	}, [error]);

	return (
		<SafeAreaProvider>
			<ThemeProvider>
				<ErrorState message={error.message || 'Something went wrong'} onRetry={() => void retry()} />
			</ThemeProvider>
		</SafeAreaProvider>
	);
}

export { Button, Text };
