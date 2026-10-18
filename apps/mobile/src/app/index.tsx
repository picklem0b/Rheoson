import type { ReactElement } from 'react';
import { Image, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { APP_VERSION } from '@/constants/config';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The first screen: a welcome, not a sign-in.
 *
 * There is no account requirement anywhere in this app — it mints a guest
 * session on first launch — so this page exists to say what the app is and get
 * out of the way. It replaces the old splash screen entirely: a splash that
 * waits on a network call is a splash that sometimes never leaves, whereas this
 * screen is instant, dismissible, and explains itself.
 */
export default function Welcome(): ReactElement {
	const router = useRouter();
	const { colour } = useTheme();

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }}>
			<View
				style={{
					flex: 1,
					alignItems: 'center',
					justifyContent: 'center',
					paddingHorizontal: spacing.xxl,
					gap: spacing.xl
				}}
			>
				<Image
					source={require('../../assets/icon.png')}
					style={{ width: 132, height: 132, borderRadius: radius.xl }}
					resizeMode='contain'
				/>
				<View style={{ alignItems: 'center', gap: spacing.sm }}>
					<Text variant='display'>Rheoson</Text>
					<Text variant='body' muted style={{ textAlign: 'center' }}>
						Your music, streamed from your own library. Search it, download it, keep it offline.
					</Text>
				</View>
			</View>

			<View style={{ padding: spacing.xl, gap: spacing.md }}>
				<Button label='Get started' onPress={() => router.replace('/(tabs)')} />
				<Text variant='caption' muted style={{ textAlign: 'center' }}>
					No account needed · v{APP_VERSION}
				</Text>
			</View>
		</SafeAreaView>
	);
}
