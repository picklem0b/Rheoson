import type { ReactElement, ReactNode } from 'react';
import { Text as RNText, type StyleProp, type TextStyle } from 'react-native';

import { typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextVariant = keyof typeof typography;

/**
 * Text with the app's scale. `variant` is the only way to size text.
 *
 * It lives in its own module rather than the UI index so components that the
 * index re-exports (the sheet, the track menu) can use it without importing the
 * index they are part of — a cycle that resolves differently depending on module
 * evaluation order.
 */
export function Text({
	children,
	variant = 'body',
	muted = false,
	numberOfLines,
	style
}: {
	children: ReactNode;
	variant?: TextVariant;
	muted?: boolean;
	numberOfLines?: number;
	style?: StyleProp<TextStyle>;
}): ReactElement {
	const { colour } = useTheme();
	return (
		<RNText
			numberOfLines={numberOfLines}
			style={[
				typography[variant],
				{ color: muted ? colour.textMuted : colour.text },
				style
			]}
		>
			{children}
		</RNText>
	);
}
