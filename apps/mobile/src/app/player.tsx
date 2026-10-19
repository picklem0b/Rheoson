import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
	CaretDownIcon,
	DownloadSimpleIcon,
	DotsThreeIcon,
	HeartIcon,
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

import { LyricsSheet } from '@/components/player/LyricsSheet';
import { QueueSheet } from '@/components/player/QueueSheet';
import { SeekBar } from '@/components/player/SeekBar';
import { Artwork, Button, EmptyState, IconButton, Text } from '@/components/ui';
import { radius, spacing, TOUCH_TARGET } from '@/constants/theme';
import { useLikeButton } from '@/hooks/use-liked';
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
 * duplicating the tab bar's navigation. The artwork stays visible behind a
 * gradient rather than disappearing into a solid panel: on a phone, the album
 * cover is the screen, and the controls sit on top of the music rather than
 * beside it.
 *
 * Everything here is one tap: scrub, skip, like, queue, lyrics, download,
 * share. The only thing behind a sheet is the queue, because it is a list and
 * a list needs room.
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
	const savedOffline = useOfflineStore(state => Boolean(track && state.saved[track.id] !== undefined));
	const savingOffline = useOfflineStore(state => Boolean(track && state.progress[track.id] !== undefined));
	const keepOnDevice = useOfflineStore(state => state.save);
	const removeFromDevice = useOfflineStore(state => state.remove);
	const { toggle, next, prev, seek } = usePlayback();
	const { isLiked, onPress: toggleLike } = useLikeButton(track?.id ?? '');

	const [queueOpen, setQueueOpen] = useState(false);
	const [lyricsOpen, setLyricsOpen] = useState(false);

	const close = (): void => {
		if (router.canGoBack()) router.back();
		else router.replace('/(tabs)');
	};

	if (!track) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }}>
				<View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: spacing.sm }}>
					<IconButton label='Close player' onPress={close}>
						<CaretDownIcon size={22} color={colour.text} />
					</IconButton>
				</View>
				<EmptyState
					title='Nothing playing'
					message='Choose something from Home, Search or your library and it will appear here.'
					action={<Button label='Find music' onPress={() => router.replace('/(tabs)/search')} />}
				/>
			</SafeAreaView>
		);
	}

	const artSize = Math.min(width - spacing.xxxl * 2, height * 0.4);
	const repeatActive = repeatMode !== 'off';

	return (
		<View style={{ flex: 1, backgroundColor: colour.background }}>
			{/* The cover, enlarged and dimmed. A failed image load just leaves the
			    background colour, which is why it can be decorative. */}
			{track.artworkUrl ? (
				<Image
					source={{ uri: track.artworkUrl }}
					style={StyleSheet.absoluteFill}
					contentFit='cover'
					blurRadius={36}
					pointerEvents='none'
				/>
			) : null}
			<LinearGradient
				pointerEvents='none'
				colors={[`${colour.background}40`, `${colour.background}E6`, colour.background]}
				locations={[0, 0.55, 1]}
				style={StyleSheet.absoluteFill}
			/>

			<SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
				<View style={{ flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'space-between' }}>
					{/* Header */}
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							justifyContent: 'space-between',
							paddingTop: spacing.xs
						}}
					>
						<IconButton label='Close player' onPress={close}>
							<CaretDownIcon size={24} color={colour.text} />
						</IconButton>
						<View style={{ flex: 1, alignItems: 'center' }}>
							<Text variant='micro' muted>
								PLAYING FROM
							</Text>
							<Text variant='caption' numberOfLines={1} style={{ maxWidth: 220 }}>
								{playSource}
							</Text>
						</View>
						<IconButton label='Track options' onPress={() => openTrackMenu(track)}>
							<DotsThreeIcon size={26} color={colour.text} weight='bold' />
						</IconButton>
					</View>

					{/* Artwork */}
					<View style={{ alignItems: 'center' }}>
						<View
							style={{
								borderRadius: radius.xl,
								borderWidth: StyleSheet.hairlineWidth,
								borderColor: colour.borderStrong
							}}
						>
							<Artwork uri={track.artworkUrl} size={artSize} rounded={radius.xl} />
						</View>
					</View>

					{/* Title */}
					<View style={{ gap: spacing.xs }}>
						<Text variant='title' numberOfLines={2}>
							{track.title}
						</Text>
						<Pressable
							disabled={!track.artist?.id || track.artist.id === 'unknown'}
							onPress={() => {
								close();
								router.push({
									pathname: '/artist/[id]',
									params: { id: track.artist?.id ?? '', name: track.artist?.name ?? '' }
								});
							}}
						>
							<Text variant='body' muted numberOfLines={1}>
								{track.artist?.name ?? 'Unknown artist'}
							</Text>
						</Pressable>
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
						<IconButton label='Shuffle' active={isShuffled} onPress={toggleShuffle}>
							<ShuffleIcon
								size={22}
								color={isShuffled ? colour.accent : colour.textMuted}
								weight={isShuffled ? 'bold' : 'regular'}
							/>
						</IconButton>
						<IconButton label='Previous track' onPress={prev}>
							<SkipBackIcon size={32} color={colour.text} weight='fill' />
						</IconButton>
						<Pressable
							onPress={toggle}
							accessibilityRole='button'
							accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
							style={({ pressed }) => ({
								width: 76,
								height: 76,
								borderRadius: 38,
								alignItems: 'center',
								justifyContent: 'center',
								backgroundColor: colour.accent,
								opacity: pressed ? 0.85 : 1
							})}
						>
							{isLoading ? (
								<ActivityIndicator color={colour.onAccent} />
							) : isPlaying ? (
								<PauseIcon size={34} color={colour.onAccent} weight='fill' />
							) : (
								<PlayIcon size={34} color={colour.onAccent} weight='fill' />
							)}
						</Pressable>
						<IconButton label='Next track' onPress={next}>
							<SkipForwardIcon size={32} color={colour.text} weight='fill' />
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
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							justifyContent: 'space-between',
							paddingBottom: spacing.sm
						}}
					>
						<IconButton
							label={isLiked ? 'Remove from favourites' : 'Add to favourites'}
							onPress={toggleLike}
						>
							<HeartIcon
								size={24}
								color={isLiked ? colour.accent : colour.textMuted}
								weight={isLiked ? 'fill' : 'regular'}
							/>
						</IconButton>
						<IconButton label='Lyrics' onPress={() => setLyricsOpen(true)}>
							<TextAaIcon size={24} color={colour.textMuted} />
						</IconButton>
						<Pressable
							onPress={() => setQueueOpen(true)}
							accessibilityRole='button'
							accessibilityLabel={`Queue, ${queueLength} up next`}
							style={{ alignItems: 'center', justifyContent: 'center', minWidth: TOUCH_TARGET, height: TOUCH_TARGET }}
						>
							<QueueIcon size={24} color={colour.textMuted} />
							{queueLength > 0 ? (
								<View
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
									<Text variant='micro' style={{ color: colour.onAccent, fontSize: 9 }}>
										{queueLength > 99 ? '99+' : queueLength}
									</Text>
								</View>
							) : null}
						</Pressable>
						<IconButton
							label={savedOffline ? 'Remove from this device' : 'Keep on this device'}
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
								/>
							)}
						</IconButton>
						<IconButton label='Share' onPress={() => void shareTrack(track)}>
							<ShareNetworkIcon size={24} color={colour.textMuted} />
						</IconButton>
					</View>
				</View>
			</SafeAreaView>

			<QueueSheet visible={queueOpen} onClose={() => setQueueOpen(false)} />
			<LyricsSheet visible={lyricsOpen} onClose={() => setLyricsOpen(false)} trackId={track.id} />
		</View>
	);
}
