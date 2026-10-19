import type { ReactElement, ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { PlayIcon } from 'phosphor-react-native';

import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Artwork } from './Artwork';
import { Text } from './Text';

/**
 * A square of artwork with a title under it.
 *
 * Shelves and album grids are the same object at different widths, so they use
 * one component and pass `size`. The play badge is drawn on the artwork rather
 * than added as a button: on a shelf, the card *is* the button, and a second
 * target inside the first is a mis-tap.
 */
export function MediaCard({
	title,
	subtitle,
	uri,
	size = 148,
	round = false,
	onPress,
	onLongPress,
	badge
}: {
	title: string;
	subtitle?: string;
	uri?: string | null;
	size?: number;
	round?: boolean;
	onPress?: () => void;
	onLongPress?: () => void;
	badge?: ReactNode;
}): ReactElement {
	const { colour } = useTheme();

	return (
		<Pressable
			onPress={onPress}
			onLongPress={onLongPress}
			accessibilityRole='button'
			accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
			style={({ pressed }) => ({ width: size, gap: spacing.sm, opacity: pressed ? 0.75 : 1 })}
		>
			<View>
				<Artwork uri={uri} size={size} rounded={round ? size / 2 : radius.md} />
				{onPress ? (
					<View
						style={{
							position: 'absolute',
							right: spacing.sm,
							bottom: spacing.sm,
							width: 32,
							height: 32,
							borderRadius: 16,
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: colour.accent
						}}
					>
						<PlayIcon size={14} color={colour.onAccent} weight='fill' />
					</View>
				) : null}
				{badge}
			</View>
			<Text variant='label' numberOfLines={1}>
				{title}
			</Text>
			{subtitle ? (
				<Text variant='caption' muted numberOfLines={1} style={{ marginTop: -spacing.xs }}>
					{subtitle}
				</Text>
			) : null}
		</Pressable>
	);
}
