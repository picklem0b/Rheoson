import type { ReactElement } from 'react';
import { View } from 'react-native';

import { layout, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useToastStore } from '@/store/toast.store';

import { Text } from './Text';

/**
 * Renders the current toast above the tab bar and the mini player.
 *
 * Positioned from the same layout constants those two use, so it never covers
 * the controls it is reporting on. `pointerEvents='none'` is deliberate: a
 * toast is not a thing to tap, and one that swallows a tap on the play button
 * for two seconds is worse than no feedback.
 */
export function Toaster(): ReactElement | null {
	const message = useToastStore(state => state.message);
	const { colour } = useTheme();

	if (!message) return null;

	return (
		<View
			pointerEvents='none'
			accessibilityLiveRegion='polite'
			style={{
				position: 'absolute',
				left: spacing.lg,
				right: spacing.lg,
				bottom: layout.tabBar + layout.miniPlayer + spacing.lg,
				alignItems: 'center'
			}}
		>
			<View
				style={{
					backgroundColor: colour.surfaceRaised,
					borderRadius: radius.pill,
					borderWidth: 0.5,
					borderColor: colour.borderStrong,
					paddingHorizontal: spacing.lg,
					paddingVertical: spacing.sm,
					maxWidth: '100%'
				}}
			>
				<Text variant='caption' style={{ textAlign: 'center' }}>
					{message}
				</Text>
			</View>
		</View>
	);
}
