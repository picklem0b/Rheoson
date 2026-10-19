import type { ReactElement } from 'react';
import { StyleSheet, TextInput, type ReturnKeyTypeOptions } from 'react-native';

import { radius, spacing, TOUCH_TARGET } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A single-line text field.
 *
 * Used for the two places the app needs typing: search and naming a playlist.
 * `autoCorrect` is off by default because every one of those fields holds a
 * title or a query, where autocorrect turns an artist name into a different
 * artist name.
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
	accessibilityLabel
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
}): ReactElement {
	const { colour } = useTheme();

	return (
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
			accessibilityLabel={accessibilityLabel ?? placeholder}
			style={{
				height: TOUCH_TARGET + spacing.sm,
				borderRadius: radius.md,
				backgroundColor: colour.surfaceRaised,
				borderWidth: StyleSheet.hairlineWidth,
				borderColor: colour.border,
				paddingHorizontal: spacing.lg,
				color: colour.text,
				fontSize: 16
			}}
		/>
	);
}
