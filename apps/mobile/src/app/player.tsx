import { useState, type ReactElement } from 'react';
import {
	ActivityIndicator,
	StyleSheet,
	useWindowDimensions,
	View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
	CaretDownIcon,
	DownloadSimpleIcon,
	DotsThreeIcon,
	PauseIcon,
	PlayIcon,
	QueueIcon,
	RepeatIcon,
	RepeatOnceIcon,
	ShareNetworkIcon,
	ShuffleIcon,
	SkipBackIcon,
	SkipForwardIcon,
	TextAaIcon
} from 'phosphor-react-native';
import { AnimatePresence, MotiView } from 'moti';

import { PressableScale, Reveal, Swap } from '@/components/motion';
import { LyricsSheet } from '@/components/player/LyricsSheet';
import { QueueSheet } from '@/components/player/QueueSheet';
import { SeekBar } from '@/components/player/SeekBar';
import { HeartButton } from '@/components/track/HeartButton';
import { Artwork, Button, EmptyState, IconButton, Text } from '@/components/ui';
import { motion, radius, spacing, TOUCH_TARGET } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { shareTrack } from '@/lib/share';
import { usePlayerStore } from '@/store/player.store';
import { useOfflineStore } from '@/store/offline.store';
import { useQueueStore } from '@/store/queue.store';
import { openTrackMenu } from '@/store/sheet.store';

/**
 * The full player.
 *
 * It is a modal route, not a tab, so it can own the whole screen without
 * duplicating the tab bar's navigation. The cover is the screen: it is shown
 * large, its blurred twin fills the background and cross-fades when the track
 * changes, and the controls sit on top of the music rather than beside it.
 *
 * Motion carries state here, not decoration:
 *  * the artwork is full size while playing and eases back when paused — the
 *    gesture Spotify and Apple Music both use, which is why a glance tells you
 *    whether sound is coming out;
 *  * title and artist cross-fade when the track changes, so skipping reads as
 *    one surface updating instead of text being swapped;
 *  * the play button morphs between its two glyphs and gives under the thumb.
 *
 * Everything the listener does constantly is one tap: scrub, skip, like, queue.
 * The thumb zone holds the transport (Fitts); the header holds only the things
 * you reach for rarely. The only thing behind a sheet is the queue, because it
 * is a list and a list needs room.
 */
export default function PlayerScreen(): ReactElement {
	const router = useRouter();
	const { colour } = useTheme();
	const { width, height } = useWindowDimensions();

	const track = usePlayerStore(state => state.currentTrack);
	const isPlaying = usePlayerStore(state => state.isPlaying);
	const isLoading = usePlayerStore(state => state.isLoading);
	const progress = usePlayerStore(state => state.progress);
	const duration = usePlayerStore(state => state.duration);
	const repeatMode = usePlayerStore(state => state.repeatMode);
	const isShuffled = usePlayerStore(state => state.isShuffled);
	const playSource = usePlayerStore(state => state.playSource);
	const cycleRepeat = usePlayerStore(state => state.cycleRepeat);
	const toggleShuffle = usePlayerStore(state => state.toggleShuffle);

	const queueLength = useQueueStore(state => state.queue.length);
	const savedOffline = useOfflineStore(state =>
		Boolean(track && state.saved[track.id] !== undefined)
	);
	const savingOffline = useOfflineStore(state =>
		Boolean(track && state.progress[track.id] !== undefined)
	);
	const keepOnDevice = useOfflineStore(state => state.save);
	const removeFromDevice = useOfflineStore(state => state.remove);
	const { toggle, next, prev, seek } = usePlayback();

	const [queueOpen, setQueueOpen] = useState(false);
	const [lyricsOpen, setLyricsOpen] = useState(false);

	const close = (): void => {
		if (router.canGoBack()) router.back();
		else router.replace('/(tabs)');
	};

	if (!track) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }}>
				<View
					style={{
						flexDirection: 'row',
						justifyContent: 'flex-end',
						padding: spacing.sm
					}}
				>
					<IconButton label='Close player' onPress={close}>
						<CaretDownIcon size={22} color={colour.text} />
					</IconButton>
				</View>
				<EmptyState
					title='Nothing playing'
					message='Choose something from Home, Search or your library and it will appear here.'
					action={
						<Button
							label='Find music'
							onPress={() => router.replace('/(tabs)/search')}
						/>
					}
				/>
			</SafeAreaView>
		);
	}

	const artSize = Math.min(width - spacing.xl * 2, height * 0.42);
	const repeatActive = repeatMode !== 'off';

	return (
		<View style={{ flex: 1, backgroundColor: colour.background }}>
			{/* The cover, enlarged and dimmed; a new track fades in over the old one. A
			    failed image load just leaves the background colour, which is why it can
			    be decorative. */}
			<AnimatePresence>
				{track.artworkUrl ? (
					<MotiView
						key={track.id}
						from={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ type: 'timing', duration: 600 }}
						style={StyleSheet.absoluteFill}
						pointerEvents='none'
					>
						<Image
							source={{ uri: track.artworkUrl }}
							style={StyleSheet.absoluteFill}
							contentFit='cover'
							blurRadius={60}
						/>
					</MotiView>
				) : null}
			</AnimatePresence>
			<LinearGradient
				pointerEvents='none'
				colors={[
					`${colour.background}59`,
					`${colour.background}D9`,
					colour.background
				]}
				locations={[0, 0.5, 0.92]}
				style={StyleSheet.absoluteFill}
			/>

			<SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
				<View
					style={{
						flex: 1,
						paddingHorizontal: spacing.xl,
						justifyContent: 'space-between'
					}}
				>
					{/* Header */}
					<Reveal distance={-10}>
						<View
							style={{
								flexDirection: 'row',
								alignItems: 'center',
								justifyContent: 'space-between',
								paddingTop: spacing.xs
							}}
						>
							<IconButton label='Close player' onPress={close}>
								<CaretDownIcon size={26} color={colour.text} weight='bold' />
							</IconButton>
							<View style={{ flex: 1, alignItems: 'center' }}>
								<Text variant='micro' muted>
									PLAYING FROM
								</Text>
								<Text
									variant='label'
									numberOfLines={1}
									style={{ maxWidth: 220 }}
								>
									{playSource}
								</Text>
							</View>
							<IconButton
								label='Track options'
								onPress={() => openTrackMenu(track)}
							>
								<DotsThreeIcon size={26} color={colour.text} weight='bold' />
							</IconButton>
						</View>
					</Reveal>

					{/* Artwork — full size while playing, eased back while paused. */}
					<View style={{ alignItems: 'center', justifyContent: 'center' }}>
						<MotiView
							animate={{ scale: isPlaying ? 1 : 0.86 }}
							transition={motion.soft}
						>
							<Swap id={track.id} distance={16}>
								<Artwork
									uri={track.artworkUrl}
									size={artSize}
									rounded={radius.xl}
									elevated
								/>
							</Swap>
						</MotiView>
					</View>

					{/* Title, artist and the heart */}
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							gap: spacing.md
						}}
					>
						<Swap id={`${track.id}-meta`} style={{ flex: 1, gap: spacing.xs }}>
							<Text variant='title' numberOfLines={2}>
								{track.title}
							</Text>
							<PressableScale
								disabled={!track.artist?.id || track.artist.id === 'unknown'}
								to={0.97}
								accessibilityRole='link'
								onPress={() => {
									close();
									router.push({
										pathname: '/artist/[id]',
										params: {
											id: track.artist?.id ?? '',
											name: track.artist?.name ?? ''
										}
									});
								}}
							>
								<Text variant='bodyStrong' muted numberOfLines={1}>
									{track.artist?.name ?? 'Unknown artist'}
								</Text>
							</PressableScale>
						</Swap>
						<HeartButton trackId={track.id} size={28} />
					</View>

					<SeekBar position={progress} duration={duration} onSeek={seek} />

					{/* Transport */}
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							justifyContent: 'space-between'
						}}
					>
						<IconButton
							label='Shuffle'
							active={isShuffled}
							onPress={toggleShuffle}
						>
							<ShuffleIcon
								size={22}
								color={isShuffled ? colour.accent : colour.textMuted}
								weight={isShuffled ? 'bold' : 'regular'}
							/>
						</IconButton>
						<IconButton label='Previous track' onPress={prev} size={56}>
							<SkipBackIcon size={34} color={colour.text} weight='fill' />
						</IconButton>
						<PressableScale
							onPress={toggle}
							to={0.92}
							accessibilityRole='button'
							accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
							style={{
								width: 80,
								height: 80,
								borderRadius: 40,
								alignItems: 'center',
								justifyContent: 'center',
								backgroundColor: colour.accent,
								shadowColor: colour.accent,
								shadowOpacity: 0.45,
								shadowRadius: 18,
								shadowOffset: { width: 0, height: 8 },
								elevation: 10
							}}
						>
							{isLoading ? (
								<ActivityIndicator color={colour.onAccent} />
							) : (
								<MotiView
									key={isPlaying ? 'pause' : 'play'}
									from={{ scale: 0.55, opacity: 0, rotate: '-40deg' }}
									animate={{ scale: 1, opacity: 1, rotate: '0deg' }}
									transition={motion.bounce}
								>
									{isPlaying ? (
										<PauseIcon
											size={38}
											color={colour.onAccent}
											weight='fill'
										/>
									) : (
										<PlayIcon size={38} color={colour.onAccent} weight='fill' />
									)}
								</MotiView>
							)}
						</PressableScale>
						<IconButton label='Next track' onPress={next} size={56}>
							<SkipForwardIcon size={34} color={colour.text} weight='fill' />
						</IconButton>
						<IconButton
							label={
								repeatMode === 'one'
									? 'Repeat this track'
									: repeatMode === 'all'
										? 'Repeat all'
										: 'Repeat off'
							}
							active={repeatActive}
							onPress={cycleRepeat}
						>
							{repeatMode === 'one' ? (
								<RepeatOnceIcon size={22} color={colour.accent} weight='bold' />
							) : (
								<RepeatIcon
									size={22}
									color={repeatActive ? colour.accent : colour.textMuted}
									weight={repeatActive ? 'bold' : 'regular'}
								/>
							)}
						</IconButton>
					</View>

					{/* Secondary actions */}
					<Reveal index={3} distance={12}>
						<View
							style={{
								flexDirection: 'row',
								alignItems: 'center',
								justifyContent: 'space-around',
								paddingBottom: spacing.sm
							}}
						>
							<IconButton label='Lyrics' onPress={() => setLyricsOpen(true)}>
								<TextAaIcon size={24} color={colour.textMuted} />
							</IconButton>
							<PressableScale
								onPress={() => setQueueOpen(true)}
								to={0.88}
								accessibilityRole='button'
								accessibilityLabel={`Queue, ${queueLength} up next`}
								style={{
									alignItems: 'center',
									justifyContent: 'center',
									minWidth: TOUCH_TARGET,
									height: TOUCH_TARGET
								}}
							>
								<QueueIcon size={24} color={colour.textMuted} />
								<AnimatePresence>
									{queueLength > 0 ? (
										<MotiView
											key='queue-badge'
											from={{ scale: 0 }}
											animate={{ scale: 1 }}
											exit={{ scale: 0 }}
											transition={motion.bounce}
											style={{
												position: 'absolute',
												top: 2,
												right: 0,
												minWidth: 16,
												height: 16,
												borderRadius: 8,
												paddingHorizontal: 4,
												alignItems: 'center',
												justifyContent: 'center',
												backgroundColor: colour.accent
											}}
										>
											<Text
												variant='micro'
												style={{
													color: colour.onAccent,
													fontSize: 9,
													letterSpacing: 0
												}}
											>
												{queueLength > 99 ? '99+' : queueLength}
											</Text>
										</MotiView>
									) : null}
								</AnimatePresence>
							</PressableScale>
							<IconButton
								label={
									savedOffline
										? 'Remove from this device'
										: 'Keep on this device'
								}
								active={savedOffline}
								onPress={() => {
									if (savedOffline) void removeFromDevice(track.id);
									else void keepOnDevice(track);
								}}
							>
								{savingOffline ? (
									<ActivityIndicator color={colour.accent} />
								) : (
									<DownloadSimpleIcon
										size={24}
										color={savedOffline ? colour.accent : colour.textMuted}
										weight={savedOffline ? 'fill' : 'regular'}
									/>
								)}
							</IconButton>
							<IconButton label='Share' onPress={() => void shareTrack(track)}>
								<ShareNetworkIcon size={24} color={colour.textMuted} />
							</IconButton>
						</View>
					</Reveal>
				</View>
			</SafeAreaView>

			<QueueSheet visible={queueOpen} onClose={() => setQueueOpen(false)} />
			<LyricsSheet
				visible={lyricsOpen}
				onClose={() => setLyricsOpen(false)}
				trackId={track.id}
			/>
		</View>
	);
}
