import { useState, type ReactElement, type ReactNode } from 'react';
import { TextInput, View, type ReturnKeyTypeOptions } from 'react-native';
import { MotiView } from 'moti';

import { motion, radius, spacing, TOUCH_TARGET } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A single-line text field.
 *
 * Used for search and for naming a playlist. `autoCorrect` is off by default
 * because every one of those fields holds a title or a query, where autocorrect
 * turns an artist name into a different artist name.
 *
 * Focus is visible: the border eases to the accent, so there is never a doubt
 * about where the keyboard is going. `leading` and `trailing` slots hold the
 * search glyph and the clear button so the field stays one rounded shape
 * instead of a field with controls glued beside it.
 */
export function Field({
	value,
	onChangeText,
	placeholder,
	autoFocus = false,
	onSubmitEditing,
	returnKeyType = 'done',
	keyboardType = 'default',
	maxLength,
	accessibilityLabel,
	leading,
	trailing
}: {
	value: string;
	onChangeText: (value: string) => void;
	placeholder?: string;
	autoFocus?: boolean;
	onSubmitEditing?: () => void;
	returnKeyType?: ReturnKeyTypeOptions;
	keyboardType?: 'default' | 'url';
	maxLength?: number;
	accessibilityLabel?: string;
	leading?: ReactNode;
	trailing?: ReactNode;
}): ReactElement {
	const { colour } = useTheme();
	const [focused, setFocused] = useState(false);

	return (
		<MotiView
			animate={{ borderColor: focused ? colour.accent : colour.border }}
			transition={{ type: 'timing', duration: motion.duration.base }}
			style={{
				height: TOUCH_TARGET + spacing.md,
				flexDirection: 'row',
				alignItems: 'center',
				gap: spacing.sm,
				borderRadius: radius.lg,
				backgroundColor: colour.surfaceRaised,
				borderWidth: 1.5,
				paddingHorizontal: spacing.lg
			}}
		>
			{leading}
			<TextInput
				value={value}
				onChangeText={onChangeText}
				placeholder={placeholder}
				placeholderTextColor={colour.textFaint}
				selectionColor={colour.accent}
				autoFocus={autoFocus}
				autoCapitalize='none'
				autoCorrect={false}
				returnKeyType={returnKeyType}
				keyboardType={keyboardType}
				maxLength={maxLength}
				onSubmitEditing={onSubmitEditing}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				accessibilityLabel={accessibilityLabel ?? placeholder}
				style={{
					flex: 1,
					height: '100%',
					color: colour.text,
					fontSize: 16,
					padding: 0
				}}
			/>
			{trailing ? <View>{trailing}</View> : null}
		</MotiView>
	);
}
