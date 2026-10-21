import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { PlayIcon } from 'phosphor-react-native';

import { EqBars, PressableScale, Pop, Reveal } from '@/components/motion';
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
 * target inside the first is a mis-tap. The card gives under the finger (0.96)
 * and the badge springs in once, so a shelf feels alive without looping
 * anything.
 *
 * `playing` swaps the badge for the live equaliser — the same "this is the one"
 * mark the track rows use.
 */
export function MediaCard({
	title,
	subtitle,
	uri,
	size = 148,
	round = false,
	onPress,
	onLongPress,
	badge,
	playing = false,
	revealIndex
}: {
	title: string;
	subtitle?: string;
	uri?: string | null;
	size?: number;
	round?: boolean;
	onPress?: () => void;
	onLongPress?: () => void;
	badge?: ReactNode;
	playing?: boolean;
	revealIndex?: number;
}): ReactElement {
	const { colour } = useTheme();

	const card = (
		<PressableScale
			onPress={onPress}
			onLongPress={onLongPress}
			to={0.96}
			accessibilityRole='button'
			accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
			style={{ width: size, gap: spacing.sm }}
		>
			<View>
				<Artwork uri={uri} size={size} rounded={round ? size / 2 : radius.md} />
				{playing ? (
					<Pop
						style={{
							position: 'absolute',
							right: spacing.sm,
							bottom: spacing.sm
						}}
					>
						<View
							style={{
								width: 32,
								height: 32,
								borderRadius: 16,
								alignItems: 'center',
								justifyContent: 'center',
								backgroundColor: colour.accent
							}}
						>
							<EqBars playing color={colour.onAccent} size={14} />
						</View>
					</Pop>
				) : onPress ? (
					<Pop
						delay={120}
						style={{
							position: 'absolute',
							right: spacing.sm,
							bottom: spacing.sm
						}}
					>
						<View
							style={{
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
					</Pop>
				) : null}
				{badge}
			</View>
			<View style={{ gap: 2 }}>
				<Text
					variant='label'
					numberOfLines={1}
					style={playing ? { color: colour.accent } : undefined}
				>
					{title}
				</Text>
				{subtitle ? (
					<Text variant='caption' muted numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>
		</PressableScale>
	);

	return revealIndex === undefined ? (
		card
	) : (
		<Reveal index={revealIndex} distance={12}>
			{card}
		</Reveal>
	);
}
