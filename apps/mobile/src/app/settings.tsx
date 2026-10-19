import type { ReactElement } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { BackBar } from '@/components/layout/BackBar';
import {
	Chip,
	ListRow,
	SectionHeader,
	Text,
	ToggleRow
} from '@/components/ui';
import { API_BASE, API_ORIGIN, APP_VERSION } from '@/constants/config';
import { layout, spacing } from '@/constants/theme';
import { useServerHealth } from '@/hooks/use-health';
import { useTheme } from '@/hooks/use-theme';
import { clearOfflineCache } from '@/lib/offlineCache';
import { formatFileSize } from '@/lib/formatters';
import { savedSummary } from '@/lib/offlineSize';
import { useOfflineStore } from '@/store/offline.store';
import { toast } from '@/store/toast.store';
import { useSettingsStore } from '@/store/settings.store';
import { clearSession, getSessionSub } from '@/services/session';

/**
 * Settings.
 *
 * Two rules decide what lives here. Every switch changes something real — a
 * toggle with no consumer is a lie, and the screen is better with eight honest
 * rows than fourteen plausible ones. And the app is honest about what it is: a
 * guest identity on this install, a self-hosted server that does the
 * downloading, and a mirror of the account kept on the device.
 */
export default function SettingsScreen(): ReactElement {
	const router = useRouter();
	const client = useQueryClient();
	const { colour, scheme } = useTheme();
	const settings = useSettingsStore();
	const health = useServerHealth();
	const savedAudio = useOfflineStore(state => state.saved);
	const clearSaved = useOfflineStore(state => state.clearAll);
	const saved = savedSummary(savedAudio);

	const clearCache = async (): Promise<void> => {
		const sub = await getSessionSub();
		if (!sub) {
			toast('Nothing cached yet');
			return;
		}
		await clearOfflineCache(sub);
		toast('Offline copies cleared');
	};

	const confirmClearSaved = (): void => {
		Alert.alert(
			'Remove saved audio?',
			`${saved.count} ${saved.count === 1 ? 'track' : 'tracks'} (${formatFileSize(saved.bytes)}) will no longer play offline. The files stay in your library on the server.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{ text: 'Remove', style: 'destructive', onPress: () => void clearSaved() }
			]
		);
	};

	const resetGuest = (): void => {
		Alert.alert(
			'Start a fresh guest?',
			'A new guest account is created on this phone. Favourites, playlists and history made as the current guest stay on the server but are no longer reachable from this device.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Start fresh',
					style: 'destructive',
					onPress: () => {
						void (async () => {
							const sub = await getSessionSub();
							if (sub) await clearOfflineCache(sub);
							await clearSession();
							client.clear();
							toast('New guest session');
							router.replace('/(tabs)');
						})();
					}
				}
			]
		);
	};

	const status = health.isLoading
		? 'Checking…'
		: health.error
			? 'Unreachable'
			: (health.data?.status ?? 'ok');
	const statusColour = health.error ? colour.danger : health.isLoading ? colour.textMuted : colour.success;
	const serverVersion = health.data?.version;
	const versionMismatch = Boolean(serverVersion && serverVersion !== APP_VERSION);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }} edges={['top']}>
			<ScrollView
				contentContainerStyle={{
					paddingHorizontal: spacing.lg,
					paddingBottom: layout.tabBar + spacing.xxl,
					gap: spacing.md
				}}
				showsVerticalScrollIndicator={false}
			>
				<BackBar title='Settings' />

				<SectionHeader title='Appearance' />
				<View style={{ flexDirection: 'row', gap: spacing.sm }}>
					<Chip label='System' active={settings.theme === 'system'} onPress={() => settings.setTheme('system')} />
					<Chip label='Dark' active={settings.theme === 'dark'} onPress={() => settings.setTheme('dark')} />
					<Chip label='Light' active={settings.theme === 'light'} onPress={() => settings.setTheme('light')} />
				</View>
				<Text variant='caption' muted>
					{scheme === 'dark' ? 'Dark is active right now.' : 'Light is active right now.'} System follows the
					phone&apos;s appearance, including a scheduled night mode.
				</Text>

				<SectionHeader title='Playback' />
				<ToggleRow
					title='Autoplay'
					subtitle='Continue with radio when the queue runs out'
					value={settings.autoplay}
					onValueChange={value => settings.set('autoplay', value)}
				/>
				<ToggleRow
					title='Warm upcoming streams'
					subtitle='Ask the server to prepare the next tracks before you reach them'
					value={settings.warmAhead}
					onValueChange={value => settings.set('warmAhead', value)}
				/>
				<ToggleRow
					title='Resume where you left off'
					subtitle='Reopen the last track paused at its position'
					value={settings.resumeOnLaunch}
					onValueChange={value => settings.set('resumeOnLaunch', value)}
				/>
				<ToggleRow
					title='Keep the screen on'
					subtitle='Only while music is playing'
					value={settings.keepAwake}
					onValueChange={value => settings.set('keepAwake', value)}
				/>
				<ToggleRow
					title='Haptic feedback'
					subtitle='A short tap on play, skip and favourite'
					value={settings.haptics}
					onValueChange={value => settings.set('haptics', value)}
				/>

				<SectionHeader title='Downloads' />
				<ToggleRow
					title='Wi-Fi only'
					subtitle='Refuse to start downloads on mobile data'
					value={settings.wifiOnlyDownloads}
					onValueChange={value => settings.set('wifiOnlyDownloads', value)}
				/>
				<ListRow
					title='Download manager'
					subtitle='Progress, retries and the server’s music folder'
					onPress={() => router.push('/(tabs)/downloads')}
				/>

				<SectionHeader title='Your listening' />
				<ListRow
					title='Listening stats'
					subtitle='Time, top tracks, artists and the hours you play most'
					onPress={() => router.push('/stats')}
				/>

				<SectionHeader title='This device' />
				<ListRow
					title='Saved audio'
					subtitle={
						saved.count > 0
							? `${saved.count} ${saved.count === 1 ? 'track' : 'tracks'} · ${formatFileSize(saved.bytes)} · plays without a connection`
							: 'Nothing saved on this phone yet'
					}
					disabled={saved.count === 0}
					onPress={confirmClearSaved}
				/>
				<ListRow
					title='Clear offline copies'
					subtitle='Frees the download of your library kept on this phone'
					onPress={() => void clearCache()}
				/>
				<ListRow
					title='Clear recent searches'
					subtitle={`${settings.recentSearches.length} remembered`}
					disabled={settings.recentSearches.length === 0}
					onPress={() => {
						settings.clearSearches();
						toast('Search history cleared');
					}}
				/>

				<SectionHeader title='Server' />
				<ListRow
					title={status}
					subtitle={`${API_BASE}${serverVersion ? ` · server v${serverVersion}` : ''}`}
					trailing={
						<Text variant='caption' style={{ color: statusColour }}>
							{health.isLoading ? 'checking' : health.error ? 'retry' : 'online'}
						</Text>
					}
					onPress={() => void health.refetch()}
				/>
				{versionMismatch ? (
					<Text variant='caption' style={{ color: colour.warning }}>
						This app is v{APP_VERSION}; the server is v{serverVersion}. Update whichever is older.
					</Text>
				) : null}
				<Text variant='caption' muted>
					{API_ORIGIN}
				</Text>

				<SectionHeader title='Account' />
				<Text variant='caption' muted>
					This install uses a guest identity — no sign-in. Favourites, playlists, follows and history belong
					to it and stay on the server, but there is no password to recover them.
				</Text>
				<ListRow
					title='Reset guest identity'
					subtitle='Start over with a new account on this phone'
					onPress={resetGuest}
				/>

				<SectionHeader title='About' />
				<Text variant='caption' muted>
					Rheoson v{APP_VERSION} · React Native
				</Text>
			</ScrollView>
		</SafeAreaView>
	);
}
