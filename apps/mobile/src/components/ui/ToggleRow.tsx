import type { ReactElement } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { radius, spacing, TOUCH_TARGET } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './Text';

/**
 * A setting that is on or off.
 *
 * The whole row is the target, not just the switch: a 30dp switch is the
 * smallest control on any screen and the easiest to miss. The switch itself is
 * inert (`pointerEvents`) and takes its state from the row, so tapping the
 * label and tapping the switch can never disagree, and the row announces itself
 * as a switch to a screen reader.
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
		<Pressable
			onPress={() => onValueChange(!value)}
			disabled={disabled}
			accessibilityRole='switch'
			accessibilityLabel={title}
			accessibilityState={{ checked: value, disabled }}
			style={({ pressed }) => ({
				minHeight: TOUCH_TARGET + spacing.md,
				flexDirection: 'row',
				alignItems: 'center',
				gap: spacing.md,
				paddingVertical: spacing.sm,
				opacity: disabled ? 0.5 : 1,
				backgroundColor: pressed ? colour.surfacePressed : 'transparent',
				borderRadius: radius.md
			})}
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
			<View pointerEvents='none'>
				<Switch
					value={value}
					trackColor={{ false: colour.surfaceRaised, true: colour.accent }}
					thumbColor={colour.text}
					disabled={disabled}
				/>
			</View>
		</Pressable>
	);
}
