import type { ReactElement } from 'react';
import { View } from 'react-native';
import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatePresence, MotiView } from 'moti';

import { layout, motion, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useChromeStore } from '@/store/chrome.store';
import { usePlayerStore } from '@/store/player.store';
import { useToastStore } from '@/store/toast.store';

import { Text } from './Text';

/**
 * Renders the current toast above whatever chrome is on screen.
 *
 * It rises and settles on a spring and leaves by sinking and fading, so a
 * confirmation reads as something that arrived and left rather than a text node
 * that blinked. Its position is read from the same facts the mini player dock
 * uses — the route and the measured tab bar — so it never covers the controls
 * it is reporting on.
 *
 * `pointerEvents='none'` is deliberate: a toast is not a thing to tap, and one
 * that swallows a tap on the play button for two seconds is worse than no
 * feedback.
 */
export function Toaster(): ReactElement {
	const message = useToastStore(state => state.message);
	const hasTrack = usePlayerStore(state => Boolean(state.currentTrack));
	const tabBarHeight = useChromeStore(state => state.tabBarHeight);
	const segments = useSegments() as string[];
	const insets = useSafeAreaInsets();
	const { colour } = useTheme();

	const top = segments[0];
	const floor =
		top === '(tabs)'
			? tabBarHeight || layout.tabBar
			: top === 'player'
				? 0
				: Math.max(insets.bottom, spacing.md);
	const bottom =
		floor +
		(hasTrack && top !== 'player' ? layout.miniPlayer + spacing.sm : 0) +
		spacing.lg;

	return (
		<View
			pointerEvents='none'
			accessibilityLiveRegion='polite'
			style={{
				position: 'absolute',
				left: spacing.lg,
				right: spacing.lg,
				bottom,
				alignItems: 'center'
			}}
		>
			<AnimatePresence>
				{message ? (
					<MotiView
						key={message}
						from={{ opacity: 0, translateY: 18, scale: 0.94 }}
						animate={{ opacity: 1, translateY: 0, scale: 1 }}
						exit={{ opacity: 0, translateY: 10, scale: 0.97 }}
						transition={motion.bounce}
						style={{
							backgroundColor: colour.surfaceRaised,
							borderRadius: radius.pill,
							borderWidth: 0.5,
							borderColor: colour.borderStrong,
							paddingHorizontal: spacing.xl,
							paddingVertical: spacing.md,
							maxWidth: '100%'
						}}
					>
						<Text variant='label' style={{ textAlign: 'center' }}>
							{message}
						</Text>
					</MotiView>
				) : null}
			</AnimatePresence>
		</View>
	);
}
