import type { ReactElement } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DotsThreeIcon } from 'phosphor-react-native';
import { MotiView } from 'moti';

import { EqBars, PressableScale, Reveal } from '@/components/motion';
import { Artwork, IconButton, Text } from '@/components/ui';
import { HeartButton } from '@/components/track/HeartButton';
import { motion, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/formatters';
import { openTrackMenu } from '@/store/sheet.store';
import type { Track } from '@rheoson/api-types';

/**
 * One track in a list.
 *
 * The row does three things and nothing else: it plays the track when tapped,
 * toggles the heart, and opens the sheet of everything less frequent. Rows that
 * grow extra inline buttons are how a list stops being scannable — the album,
 * artist, download, queue and share actions all live in the sheet.
 *
 * The track that is playing is marked three ways at once — accent title, live
 * equaliser over its artwork, and a faint accent wash behind the row — so it is
 * findable at a glance in a list of three hundred (the same cue Spotify and
 * Apple Music use, which is exactly why people already read it).
 *
 * `isPlaying` is passed in rather than read from the store: a list of 300 rows
 * each subscribing to the player would re-render all of them on every progress
 * tick. Pass the row's list position as `revealIndex` to stagger it in; leave it
 * out in virtualised lists, where re-mounting rows would replay the entrance.
 *
 * With no `onMenu` the row opens the shared track sheet itself, and a long
 * press does the same.
 */
export function TrackRow({
	track,
	onPress,
	onMenu,
	isPlaying = false,
	loading = false,
	trailing,
	index,
	showArtwork = true,
	revealIndex
}: {
	track: Track;
	onPress: () => void;
	onMenu?: () => void;
	isPlaying?: boolean;
	loading?: boolean;
	trailing?: ReactElement;
	/** 1-based position, shown instead of artwork on an album or playlist. */
	index?: number;
	showArtwork?: boolean;
	revealIndex?: number;
}): ReactElement {
	const { colour } = useTheme();
	const openMenu = onMenu ?? (() => openTrackMenu(track));

	const row = (
		<PressableScale
			onPress={onPress}
			onLongPress={openMenu}
			to={0.985}
			accessibilityRole='button'
			accessibilityLabel={`${track.title}, ${track.artist?.name ?? 'Unknown artist'}${isPlaying ? ', now playing' : ''}`}
			style={{ borderRadius: radius.md }}
		>
			<MotiView
				animate={{
					backgroundColor: isPlaying ? colour.accentSubtle : 'rgba(0,0,0,0)'
				}}
				transition={{ type: 'timing', duration: motion.duration.base }}
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					gap: spacing.md,
					paddingVertical: spacing.sm,
					paddingLeft: spacing.sm,
					paddingRight: spacing.xs,
					borderRadius: radius.md
				}}
			>
				{showArtwork ? (
					<View>
						<Artwork uri={track.artworkUrl} size={52} rounded={radius.sm + 2} />
						{isPlaying ? (
							<View
								style={{
									position: 'absolute',
									top: 0,
									left: 0,
									right: 0,
									bottom: 0,
									borderRadius: radius.sm + 2,
									alignItems: 'center',
									justifyContent: 'center',
									backgroundColor: 'rgba(0,0,0,0.5)'
								}}
							>
								<EqBars playing color='#FFFFFF' size={16} />
							</View>
						) : null}
					</View>
				) : (
					<View style={{ width: 32, alignItems: 'center' }}>
						{isPlaying ? (
							<EqBars playing color={colour.accent} size={14} />
						) : (
							<Text variant='caption' muted>
								{index ?? '·'}
							</Text>
						)}
					</View>
				)}
				<View style={{ flex: 1, gap: 2 }}>
					<Text
						variant='bodyStrong'
						numberOfLines={1}
						style={isPlaying ? { color: colour.accent } : undefined}
					>
						{track.title}
					</Text>
					<Text variant='caption' muted numberOfLines={1}>
						{track.artist?.name ?? 'Unknown artist'}
						{track.duration ? ` · ${formatDuration(track.duration)}` : ''}
					</Text>
				</View>
				{trailing}
				{loading ? <ActivityIndicator color={colour.accent} /> : null}
				<HeartButton trackId={track.id} size={20} />
				<IconButton label='More options' onPress={openMenu}>
					<DotsThreeIcon size={22} color={colour.textMuted} weight='bold' />
				</IconButton>
			</MotiView>
		</PressableScale>
	);

	return revealIndex === undefined ? (
		row
	) : (
		<Reveal index={revealIndex} distance={10}>
			{row}
		</Reveal>
	);
}
