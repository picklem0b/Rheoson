import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
	ShieldCheckIcon,
	WaveformIcon,
	WifiSlashIcon
} from 'phosphor-react-native';

import { Pop, Pulse, Reveal } from '@/components/motion';
import { Button, Logo, Text } from '@/components/ui';
import { APP_VERSION } from '@/constants/config';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { readJson, writeJson } from '@/lib/storage';

const ONBOARDED_KEY = 'rheoson.onboarded';

/**
 * The first screen: a welcome, not a sign-in.
 *
 * There is no account requirement anywhere in this app — it mints a guest
 * session on first launch — so this page exists to say what the app is and get
 * out of the way. It is instant (no network call stands between the splash and
 * this screen), it says three true things (Miller: three, not seven), and it
 * ends in exactly one primary action at the bottom of the screen, where the
 * thumb already is (Fitts).
 *
 * It is shown *once*. Every launch after the first goes straight to music,
 * which is what a music app should do.
 *
 * The mark is drawn by `Logo`, which fits the whole circle-and-stem artwork
 * inside a square box. Drawing the raw icon file into a rounded box is what made
 * the old welcome screen look zoomed in: that file is full-bleed by design.
 */
export default function Welcome(): ReactElement {
	const router = useRouter();
	const { colour } = useTheme();
	const [checking, setChecking] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void readJson<boolean>(ONBOARDED_KEY).then(seen => {
			if (cancelled) return;
			if (seen) {
				router.replace('/(tabs)');
				return;
			}
			setChecking(false);
		});
		return () => {
			cancelled = true;
		};
	}, [router]);

	const start = (): void => {
		void writeJson(ONBOARDED_KEY, true);
		router.replace('/(tabs)');
	};

	if (checking) {
		return <View style={{ flex: 1, backgroundColor: colour.background }} />;
	}

	return (
		<View style={{ flex: 1, backgroundColor: colour.background }}>
			<LinearGradient
				pointerEvents='none'
				colors={[
					colour.accentSubtle,
					'rgba(228,37,59,0.04)',
					'rgba(228,37,59,0)'
				]}
				locations={[0, 0.45, 1]}
				style={[StyleSheet.absoluteFill, { height: '65%' }]}
			/>
			<SafeAreaView style={{ flex: 1 }}>
				<View
					style={{
						flex: 1,
						alignItems: 'center',
						justifyContent: 'center',
						paddingHorizontal: spacing.xxl,
						gap: spacing.xxl
					}}
				>
					<View
						style={{
							width: 132,
							height: 132,
							alignItems: 'center',
							justifyContent: 'center'
						}}
					>
						<Pulse color={colour.accent} size={132} />
						<Pop>
							<Logo size='hero' />
						</Pop>
					</View>

					<Reveal
						index={1}
						distance={16}
						style={{ alignItems: 'center', gap: spacing.sm }}
					>
						<Text variant='display'>Rheoson</Text>
						<Text
							variant='body'
							muted
							style={{ textAlign: 'center', maxWidth: 300 }}
						>
							Your music, streamed from your own server.
						</Text>
					</Reveal>

					<View style={{ alignSelf: 'stretch', gap: spacing.md }}>
						<Feature
							index={2}
							icon={
								<WaveformIcon size={22} color={colour.accent} weight='fill' />
							}
							title='Search it. Play it.'
							body='Tracks, albums, artists and playlists, streaming in a moment.'
						/>
						<Feature
							index={3}
							icon={
								<WifiSlashIcon size={22} color={colour.accent} weight='fill' />
							}
							title='Keep it for the dead zones'
							body='Save tracks on this phone and they play with no signal.'
						/>
						<Feature
							index={4}
							icon={
								<ShieldCheckIcon
									size={22}
									color={colour.accent}
									weight='fill'
								/>
							}
							title='No account, no sign-in'
							body='Your favourites and playlists stay with this install.'
						/>
					</View>
				</View>

				<Reveal
					index={5}
					distance={20}
					style={{ padding: spacing.xl, gap: spacing.md }}
				>
					<Button label='Get started' onPress={start} />
					<Text variant='caption' muted style={{ textAlign: 'center' }}>
						Free and private · v{APP_VERSION}
					</Text>
				</Reveal>
			</SafeAreaView>
		</View>
	);
}

function Feature({
	icon,
	title,
	body,
	index
}: {
	icon: ReactNode;
	title: string;
	body: string;
	index: number;
}): ReactElement {
	const { colour } = useTheme();
	return (
		<Reveal index={index} distance={14}>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					gap: spacing.md,
					padding: spacing.md,
					borderRadius: radius.lg,
					backgroundColor: colour.surfaceRaised,
					borderWidth: StyleSheet.hairlineWidth,
					borderColor: colour.border
				}}
			>
				<View
					style={{
						width: 44,
						height: 44,
						borderRadius: radius.md,
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: colour.accentSubtle
					}}
				>
					{icon}
				</View>
				<View style={{ flex: 1, gap: 2 }}>
					<Text variant='bodyStrong'>{title}</Text>
					<Text variant='caption' muted>
						{body}
					</Text>
				</View>
			</View>
		</Reveal>
	);
}
