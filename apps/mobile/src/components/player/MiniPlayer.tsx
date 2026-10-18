import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PauseIcon, PlayIcon, SkipForwardIcon } from 'phosphor-react-native';

import { Artwork, IconButton, Text } from '@/components/ui';
import { layout, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlayback } from '@/hooks/use-playback';
import { usePlayerStore } from '@/store/player.store';

/**
 * The bar that sits above the tab bar while something is loaded.
 *
 * It exists so playback is always one tap away without stealing a tab, and it
 * shows progress as a hairline along its top edge rather than a slider — a
 * 64dp-thumb target is a mis-tap waiting to happen, and the full player is one
 * tap away for real seeking.
 */
export function MiniPlayer(): ReactElement | null {
	const router = useRouter();
	const { colour } = useTheme();
	const { toggle, next } = usePlayback();

	const track = usePlayerStore(state => state.currentTrack);
	const isPlaying = usePlayerStore(state => state.isPlaying);
	const progress = usePlayerStore(state => state.progress);
	const duration = usePlayerStore(state => state.duration);

	if (!track) return null;
	const ratio = duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;

	return (
		<Pressable
			onPress={() => router.push('/player')}
			style={{
				height: layout.miniPlayer,
				marginHorizontal: spacing.sm,
				marginBottom: spacing.sm,
				borderRadius: radius.lg,
				overflow: 'hidden',
				backgroundColor: colour.player,
				flexDirection: 'row',
				alignItems: 'center',
				gap: spacing.md,
				paddingHorizontal: spacing.md,
				borderWidth: 0.5,
				borderColor: colour.border
			}}
		>
			<View
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					right: 0,
					height: 2,
					backgroundColor: colour.border
				}}
			>
				<View
					style={{ width: `${ratio * 100}%`, height: 2, backgroundColor: colour.accent }}
				/>
			</View>

			<Artwork uri={track.artworkUrl} size={40} />
			<View style={{ flex: 1 }}>
				<Text variant='label' numberOfLines={1}>
					{track.title}
				</Text>
				<Text variant='caption' muted numberOfLines={1}>
					{track.artist?.name ?? 'Unknown artist'}
				</Text>
			</View>
			<IconButton label={isPlaying ? 'Pause' : 'Play'} onPress={toggle}>
				{isPlaying ? (
					<PauseIcon size={24} color={colour.text} weight='fill' />
				) : (
					<PlayIcon size={24} color={colour.text} weight='fill' />
				)}
			</IconButton>
			<IconButton label='Next track' onPress={next}>
				<SkipForwardIcon size={22} color={colour.text} weight='fill' />
			</IconButton>
		</Pressable>
	);
}
