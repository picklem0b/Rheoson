import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { PauseIcon, PlayIcon, SkipForwardIcon } from 'phosphor-react-native';
import { AnimatePresence, MotiView } from 'moti';

import { PressableScale, SmoothFill } from '@/components/motion';
import { Artwork, IconButton, Text } from '@/components/ui';
import { layout, motion, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlayback } from '@/hooks/use-playback';
import { usePlayerStore } from '@/store/player.store';

/**
 * The bar that floats above the tab bar while something is loaded.
 *
 * It exists so playback is always one tap away without stealing a tab. It
 * borrows the look of the apps people already know: a card tinted by the cover
 * it is playing (the artwork, blurred and dimmed behind the text), a hairline
 * of progress along the bottom edge, and the artwork gliding gently when paused
 * versus playing. Progress is a hairline rather than a slider — a slider this
 * small is a mis-tap waiting to happen, and the full player is one tap away for
 * real seeking.
 *
 * It slides up the first time a track is loaded and the play/pause glyph
 * morphs between states rather than swapping.
 */
export function MiniPlayer(): ReactElement {
	const router = useRouter();
	const { colour } = useTheme();
	const { toggle, next } = usePlayback();

	const track = usePlayerStore(state => state.currentTrack);
	const isPlaying = usePlayerStore(state => state.isPlaying);
	const progress = usePlayerStore(state => state.progress);
	const duration = usePlayerStore(state => state.duration);

	const ratio =
		duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;

	return (
		<AnimatePresence>
			{track ? (
				<MotiView
					key='mini-player'
					from={{ opacity: 0, translateY: 28, scale: 0.97 }}
					animate={{ opacity: 1, translateY: 0, scale: 1 }}
					exit={{ opacity: 0, translateY: 28 }}
					transition={motion.soft}
					style={{ marginHorizontal: spacing.md, marginBottom: spacing.sm }}
				>
					<PressableScale
						onPress={() => router.push('/player')}
						to={0.985}
						accessibilityRole='button'
						accessibilityLabel={`Open the player. ${track.title}, ${track.artist?.name ?? 'Unknown artist'}`}
						style={{
							height: layout.miniPlayer,
							borderRadius: radius.lg,
							overflow: 'hidden',
							backgroundColor: colour.player,
							flexDirection: 'row',
							alignItems: 'center',
							gap: spacing.md,
							paddingLeft: spacing.sm + 2,
							paddingRight: spacing.xs,
							borderWidth: StyleSheet.hairlineWidth,
							borderColor: colour.borderStrong
						}}
					>
						{track.artworkUrl ? (
							<Image
								source={{ uri: track.artworkUrl }}
								style={[StyleSheet.absoluteFill, { opacity: 0.28 }]}
								contentFit='cover'
								blurRadius={40}
								pointerEvents='none'
							/>
						) : null}

						<MotiView
							animate={{ scale: isPlaying ? 1 : 0.92 }}
							transition={motion.bounce}
						>
							<Artwork
								uri={track.artworkUrl}
								size={46}
								rounded={radius.sm + 2}
							/>
						</MotiView>

						<View style={{ flex: 1, gap: 1 }}>
							<Text variant='label' numberOfLines={1}>
								{track.title}
							</Text>
							<Text variant='caption' muted numberOfLines={1}>
								{track.artist?.name ?? 'Unknown artist'}
							</Text>
						</View>

						<IconButton label={isPlaying ? 'Pause' : 'Play'} onPress={toggle}>
							<MotiView
								key={isPlaying ? 'pause' : 'play'}
								from={{ scale: 0.6, opacity: 0, rotate: '-30deg' }}
								animate={{ scale: 1, opacity: 1, rotate: '0deg' }}
								transition={motion.bounce}
							>
								{isPlaying ? (
									<PauseIcon size={26} color={colour.text} weight='fill' />
								) : (
									<PlayIcon size={26} color={colour.text} weight='fill' />
								)}
							</MotiView>
						</IconButton>
						<IconButton label='Next track' onPress={next}>
							<SkipForwardIcon size={22} color={colour.text} weight='fill' />
						</IconButton>

						<View
							pointerEvents='none'
							style={{
								position: 'absolute',
								left: 0,
								right: 0,
								bottom: 0,
								height: 2.5,
								backgroundColor: colour.border
							}}
						>
							<SmoothFill
								ratio={ratio}
								height={2.5}
								color={colour.accent}
								duration={500}
							/>
						</View>
					</PressableScale>
				</MotiView>
			) : null}
		</AnimatePresence>
	);
}
