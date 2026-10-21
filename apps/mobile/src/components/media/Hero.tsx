import type { ReactElement, ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Pop, Reveal } from '@/components/motion';
import { Artwork, Text } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The top of an album, playlist or artist page.
 *
 * One large image, a title, and at most two lines of fact under it. Everything
 * else on the page is a list, and a hero that competes with it makes the first
 * screenful say nothing. The subtitle is pressable when it leads somewhere —
 * an album's artist, for instance.
 */
export function Hero({
	artworkUri,
	title,
	subtitle,
	meta,
	onSubtitlePress,
	round = false,
	children
}: {
	artworkUri?: string | null;
	title: string;
	subtitle?: string;
	meta?: string;
	onSubtitlePress?: () => void;
	round?: boolean;
	children?: ReactNode;
}): ReactElement {
	const { colour } = useTheme();

	return (
		<View
			style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm }}
		>
			<Pop>
				<Artwork
					uri={artworkUri}
					size={196}
					rounded={round ? 98 : radius.lg}
					elevated
				/>
			</Pop>
			<Reveal
				index={1}
				distance={12}
				style={{ alignItems: 'center', gap: spacing.xs, alignSelf: 'stretch' }}
			>
				<Text variant='title' numberOfLines={2} style={{ textAlign: 'center' }}>
					{title}
				</Text>
				{subtitle ? (
					onSubtitlePress ? (
						<Pressable onPress={onSubtitlePress} hitSlop={spacing.sm}>
							<Text
								variant='body'
								style={{ color: colour.accent }}
								numberOfLines={1}
							>
								{subtitle}
							</Text>
						</Pressable>
					) : (
						<Text variant='body' muted numberOfLines={1}>
							{subtitle}
						</Text>
					)
				) : null}
				{meta ? (
					<Text
						variant='caption'
						muted
						numberOfLines={2}
						style={{ textAlign: 'center' }}
					>
						{meta}
					</Text>
				) : null}
			</Reveal>
			{children ? (
				<Reveal index={2} distance={10}>
					{children}
				</Reveal>
			) : null}
		</View>
	);
}
