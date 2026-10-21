import type { ReactElement } from 'react';
import { View } from 'react-native';
import { MotiView } from 'moti';

import { PressableScale } from '@/components/motion';
import { motion, spacing, TOUCH_TARGET } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './Text';

const TRACK_W = 52;
const TRACK_H = 32;
const THUMB = 26;
const PAD = 3;

/**
 * A setting that is on or off.
 *
 * The whole row is the target, not just the switch: a 30dp switch is the
 * smallest control on any screen and the easiest to miss (Fitts). The switch is
 * drawn here rather than taken from the platform so it can behave the same on
 * both: the thumb springs across and stretches slightly while it travels, and
 * the track fades to the accent. The row announces itself as a switch to a
 * screen reader, so the visual is purely decorative.
 */
export function ToggleRow({
	title,
	subtitle,
	value,
	onValueChange,
	disabled = false
}: {
	title: string;
	subtitle?: string;
	value: boolean;
	onValueChange: (value: boolean) => void;
	disabled?: boolean;
}): ReactElement {
	const { colour } = useTheme();

	return (
		<PressableScale
			onPress={() => onValueChange(!value)}
			disabled={disabled}
			to={0.985}
			accessibilityRole='switch'
			accessibilityLabel={title}
			accessibilityState={{ checked: value, disabled }}
			style={{
				minHeight: TOUCH_TARGET + spacing.lg,
				flexDirection: 'row',
				alignItems: 'center',
				gap: spacing.md,
				paddingVertical: spacing.sm,
				opacity: disabled ? 0.5 : 1
			}}
		>
			<View style={{ flex: 1 }}>
				<Text variant='bodyStrong' numberOfLines={1}>
					{title}
				</Text>
				{subtitle ? (
					<Text variant='caption' muted numberOfLines={2}>
						{subtitle}
					</Text>
				) : null}
			</View>
			<MotiView
				pointerEvents='none'
				animate={{
					backgroundColor: value ? colour.accent : colour.surfacePressed
				}}
				transition={{ type: 'timing', duration: motion.duration.base }}
				style={{
					width: TRACK_W,
					height: TRACK_H,
					borderRadius: TRACK_H / 2,
					padding: PAD
				}}
			>
				<MotiView
					animate={{ translateX: value ? TRACK_W - THUMB - PAD * 2 : 0 }}
					transition={motion.bounce}
					style={{
						width: THUMB,
						height: THUMB,
						borderRadius: THUMB / 2,
						backgroundColor: '#FFFFFF'
					}}
				/>
			</MotiView>
		</PressableScale>
	);
}
