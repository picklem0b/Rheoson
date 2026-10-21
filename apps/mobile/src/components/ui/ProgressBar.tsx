import type { ReactElement } from 'react';
import { View } from 'react-native';

import { SmoothFill } from '@/components/motion';
import { useTheme } from '@/hooks/use-theme';

/**
 * A progress bar whose fill glides.
 *
 * `ratio` is clamped here rather than at every call site, because the two
 * producers of it — a download job's percentage and the player's position — can
 * both briefly exceed 1 while the UI catches up. A bar that overflows its track
 * is a rendering bug the user sees. The fill itself is `SmoothFill`, so
 * progress that arrives in steps is drawn as continuous motion.
 */
export function ProgressBar({
	ratio,
	height = 4,
	tone = 'accent'
}: {
	ratio: number;
	height?: number;
	tone?: 'accent' | 'danger' | 'success';
}): ReactElement {
	const { colour } = useTheme();
	const safe = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
	const fill =
		tone === 'danger'
			? colour.danger
			: tone === 'success'
				? colour.success
				: colour.accent;

	return (
		<View
			style={{
				height,
				borderRadius: height / 2,
				backgroundColor: colour.surfacePressed,
				overflow: 'hidden'
			}}
			accessibilityRole='progressbar'
			accessibilityValue={{ min: 0, max: 100, now: Math.round(safe * 100) }}
		>
			<SmoothFill ratio={safe} height={height} color={fill} duration={400} />
		</View>
	);
}
