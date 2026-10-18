import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { DotsThreeIcon, HeartIcon } from 'phosphor-react-native';

import { Artwork, IconButton, Text } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLikeButton } from '@/hooks/use-liked';
import { formatDuration } from '@/lib/formatters';
import type { Track } from '@rheoson/api-types';

/**
 * One track in a list.
 *
 * The row does three things and nothing else: it plays the track when tapped,
 * toggles the heart, and opens the sheet of everything less frequent. Rows that
 * grow extra inline buttons are how a list stops being scannable — the album,
 * artist, download, queue and share actions all live in the sheet.
 *
 * `isPlaying` is passed in rather than read from the store: a list of 300 rows
 * each subscribing to the player would re-render all of them on every progress
 * tick.
 */
export function TrackRow({
	track,
	onPress,
	onMenu,
	isPlaying = false,
	loading = false,
	trailing
}: {
	track: Track;
	onPress: () => void;
	onMenu?: () => void;
	isPlaying?: boolean;
	loading?: boolean;
	trailing?: ReactElement;
}): ReactElement {
	const { colour } = useTheme();
	const { isLiked, onPress: toggleLike } = useLikeButton(track.id);

	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => ({
				flexDirection: 'row',
				alignItems: 'center',
				gap: spacing.md,
				paddingVertical: spacing.sm,
				paddingHorizontal: spacing.sm,
				borderRadius: 12,
				backgroundColor: pressed ? colour.surfacePressed : 'transparent'
			})}
		>
			<Artwork
				uri={
					track.artworkUrl ??
					(track.album?.id ? `${track.artworkUrl ?? ''}` : undefined)
				}
				size={48}
			/>
			<View style={{ flex: 1 }}>
				<Text variant='bodyStrong' numberOfLines={1} style={isPlaying ? { color: colour.accent } : undefined}>
					{track.title}
				</Text>
				<Text variant='caption' muted numberOfLines={1}>
					{track.artist?.name ?? 'Unknown artist'}
					{track.duration ? ` · ${formatDuration(track.duration)}` : ''}
				</Text>
			</View>
			{trailing}
			{loading ? <ActivityIndicator color={colour.accent} /> : null}
			<IconButton label={isLiked ? 'Remove from favourites' : 'Add to favourites'} onPress={toggleLike}>
				<HeartIcon
					size={20}
					color={isLiked ? colour.accent : colour.textMuted}
					weight={isLiked ? 'fill' : 'regular'}
				/>
			</IconButton>
			{onMenu ? (
				<IconButton label='More options' onPress={onMenu}>
					<DotsThreeIcon size={22} color={colour.textMuted} weight='bold' />
				</IconButton>
			) : null}
		</Pressable>
	);
}
