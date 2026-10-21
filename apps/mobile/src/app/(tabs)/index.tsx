import { useState, type ReactElement } from 'react';
import {
	RefreshControl,
	ScrollView,
	StyleSheet,
	useWindowDimensions,
	View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import {
	ChartBarIcon,
	GearIcon,
	PauseIcon,
	PlayIcon
} from 'phosphor-react-native';
import { MotiView } from 'moti';

import { recommendationsApi, type HomeShelf } from '@/api/recommendations.api';
import { tracksApi } from '@/api/tracks.api';
import { EqBars, PressableScale, Reveal } from '@/components/motion';
import { TrackRow } from '@/components/track/TrackRow';
import {
	AppBar,
	Artwork,
	Button,
	EmptyState,
	ErrorState,
	IconButton,
	MediaCard,
	ProgressBar,
	SectionHeader,
	Skeleton,
	Text
} from '@/components/ui';
import { layout, motion, radius, spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { humanError } from '@/lib/errors';
import { qk } from '@/lib/queryKeys';
import { usePlayerStore } from '@/store/player.store';
import type { Track } from '@rheoson/api-types';

/**
 * Home: what to play right now.
 *
 * The structure follows the home screens people already know (Jakob's law):
 * a time-aware greeting, a compact grid of the things you played most recently
 * — one tap from sound, which is what a returning listener wants — then rails
 * of recommendations, then a chart. A phone home screen is a starting point, not
 * a catalogue: anything that needs browsing belongs behind Search or Library.
 *
 * "Continue listening" is only shown when something is actually loaded
 * (Zeigarnik: an unfinished thing pulls you back), and it is the one tinted card
 * on the page, so it is where the eye lands first.
 *
 * Everything arrives with a staggered rise; pull to refresh is the one gesture
 * people try without being told, so it refetches all three sources at once.
 */
export default function HomeScreen(): ReactElement {
	const router = useRouter();
	const { colour } = useTheme();
	const { width } = useWindowDimensions();
	const { playTrack, toggle } = usePlayback();
	const [refreshing, setRefreshing] = useState(false);

	const current = usePlayerStore(state => state.currentTrack);
	const isPlaying = usePlayerStore(state => state.isPlaying);
	const progress = usePlayerStore(state => state.progress);
	const duration = usePlayerStore(state => state.duration);

	const recent = useQuery({
		queryKey: qk.recentlyPlayed(),
		queryFn: () => tracksApi.recentlyPlayed(12)
	});
	const shelves = useQuery({
		queryKey: qk.home(),
		queryFn: () => recommendationsApi.home()
	});
	const weekly = useQuery({
		queryKey: qk.trendingWeekly(),
		queryFn: () => tracksApi.trendingWeekly(10)
	});

	const loading = recent.isLoading && shelves.isLoading && weekly.isLoading;
	const failure = recent.error ?? shelves.error ?? weekly.error;

	const refresh = async (): Promise<void> => {
		setRefreshing(true);
		await Promise.all([
			recent.refetch(),
			shelves.refetch(),
			weekly.refetch()
		]).catch(() => undefined);
		setRefreshing(false);
	};

	const empty =
		!loading &&
		!failure &&
		!current &&
		(recent.data?.length ?? 0) === 0 &&
		(shelves.data?.length ?? 0) === 0 &&
		(weekly.data?.length ?? 0) === 0;

	const quickTileWidth = (width - spacing.lg * 2 - spacing.sm) / 2;
	const quick = (recent.data ?? []).slice(0, 6);

	return (
		<View style={{ flex: 1, backgroundColor: colour.background }}>
			{/* A wash of accent behind the header — the page's one flourish. */}
			<LinearGradient
				pointerEvents='none'
				colors={[colour.accentSubtle, 'rgba(228,37,59,0)']}
				style={[StyleSheet.absoluteFill, { height: 280 }]}
			/>
			<SafeAreaView style={{ flex: 1 }} edges={['top']}>
				<ScrollView
					contentContainerStyle={{
						paddingHorizontal: spacing.lg,
						paddingBottom: layout.miniPlayer + layout.tabBar + spacing.xxl,
						gap: spacing.md
					}}
					showsVerticalScrollIndicator={false}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={() => void refresh()}
							tintColor={colour.accent}
							colors={[colour.accent]}
							progressBackgroundColor={colour.surfaceRaised}
						/>
					}
				>
					<AppBar
						title={greeting()}
						subtitle='Your library, ready to play'
						action={
							<View style={{ flexDirection: 'row' }}>
								<IconButton
									label='Listening stats'
									onPress={() => router.push('/stats')}
								>
									<ChartBarIcon size={22} color={colour.textMuted} />
								</IconButton>
								<IconButton
									label='Settings'
									onPress={() => router.push('/settings')}
								>
									<GearIcon size={22} color={colour.textMuted} />
								</IconButton>
							</View>
						}
					/>

					{loading ? (
						<View style={{ gap: spacing.md }}>
							<View
								style={{
									flexDirection: 'row',
									flexWrap: 'wrap',
									gap: spacing.sm
								}}
							>
								{Array.from({ length: 6 }, (_, index) => (
									<Skeleton key={index} height={56} width={quickTileWidth} />
								))}
							</View>
							<Skeleton height={20} width='40%' />
							<View style={{ flexDirection: 'row', gap: spacing.md }}>
								<Skeleton height={144} width={144} />
								<Skeleton height={144} width={144} />
								<Skeleton height={144} width={144} />
							</View>
							<Skeleton height={64} />
							<Skeleton height={64} />
						</View>
					) : null}

					{failure ? (
						<ErrorState
							message={humanError(failure)}
							onRetry={() => {
								void recent.refetch();
								void shelves.refetch();
								void weekly.refetch();
							}}
						/>
					) : null}

					{quick.length > 0 ? (
						<View
							style={{
								flexDirection: 'row',
								flexWrap: 'wrap',
								gap: spacing.sm
							}}
						>
							{quick.map((track, index) => (
								<QuickTile
									key={`quick-${track.id}`}
									track={track}
									width={quickTileWidth}
									index={index}
									active={track.id === current?.id}
									playing={track.id === current?.id && isPlaying}
									onPress={() =>
										playTrack(track, recent.data, 'Recently played')
									}
								/>
							))}
						</View>
					) : null}

					{current ? (
						<Reveal index={2} distance={14}>
							<ContinueCard
								track={current}
								isPlaying={isPlaying}
								progress={progress}
								duration={duration}
								onOpen={() => router.push('/player')}
								onToggle={toggle}
							/>
						</Reveal>
					) : null}

					{shelves.data?.map((shelf, index) => (
						<Shelf
							key={shelf.id}
							shelf={shelf}
							index={index}
							currentId={current?.id}
							playing={isPlaying}
							onPlay={(track, context) =>
								playTrack(track, context, shelf.title)
							}
						/>
					))}

					{weekly.data && weekly.data.length > 0 ? (
						<>
							<SectionHeader title='Trending this week' />
							{weekly.data.slice(0, 5).map((track, index) => (
								<TrackRow
									key={`weekly-${track.id}-${index}`}
									track={track}
									index={index + 1}
									showArtwork
									revealIndex={index}
									isPlaying={track.id === current?.id}
									onPress={() =>
										playTrack(track, weekly.data, 'Trending this week')
									}
								/>
							))}
						</>
					) : null}

					{empty ? (
						<EmptyState
							title='Nothing here yet'
							message='Play something from Search or Library and this page starts filling in.'
							action={
								<Button
									label='Find music'
									variant='secondary'
									onPress={() => router.push('/search')}
								/>
							}
						/>
					) : null}
				</ScrollView>
			</SafeAreaView>
		</View>
	);
}

/**
 * A compact "play this again" tile — artwork, one line of title, and the
 * equaliser while it is the track playing. Two to a row, 56dp tall: a big
 * enough target to hit one-handed without searching.
 */
function QuickTile({
	track,
	width,
	index,
	active,
	playing,
	onPress
}: {
	track: Track;
	width: number;
	index: number;
	active: boolean;
	playing: boolean;
	onPress: () => void;
}): ReactElement {
	const { colour } = useTheme();
	return (
		<Reveal index={index} distance={10} style={{ width }}>
			<PressableScale
				onPress={onPress}
				to={0.96}
				accessibilityRole='button'
				accessibilityLabel={`Play ${track.title}`}
				style={{
					height: 56,
					flexDirection: 'row',
					alignItems: 'center',
					gap: spacing.sm,
					borderRadius: radius.md,
					overflow: 'hidden',
					backgroundColor: active ? colour.accentSubtle : colour.surfaceRaised,
					borderWidth: StyleSheet.hairlineWidth,
					borderColor: active ? colour.accentBorder : colour.border,
					paddingRight: spacing.sm
				}}
			>
				<Artwork uri={track.artworkUrl} size={56} rounded={0} />
				<Text
					variant='label'
					numberOfLines={2}
					style={[{ flex: 1 }, active ? { color: colour.accent } : undefined]}
				>
					{track.title}
				</Text>
				{playing ? <EqBars playing color={colour.accent} size={14} /> : null}
			</PressableScale>
		</Reveal>
	);
}

/** The last track, still loaded, with its position. */
function ContinueCard({
	track,
	isPlaying,
	progress,
	duration,
	onOpen,
	onToggle
}: {
	track: Track;
	isPlaying: boolean;
	progress: number;
	duration: number;
	onOpen: () => void;
	onToggle: () => void;
}): ReactElement {
	const { colour } = useTheme();
	const ratio = duration > 0 ? Math.min(1, progress / duration) : 0;

	return (
		<PressableScale
			onPress={onOpen}
			to={0.98}
			accessibilityRole='button'
			accessibilityLabel={`Open the player for ${track.title}`}
			style={{
				backgroundColor: colour.player,
				borderRadius: radius.xl,
				borderWidth: StyleSheet.hairlineWidth,
				borderColor: colour.borderStrong,
				overflow: 'hidden'
			}}
		>
			{track.artworkUrl ? (
				<Image
					source={{ uri: track.artworkUrl }}
					style={[StyleSheet.absoluteFill, { opacity: 0.3 }]}
					contentFit='cover'
					blurRadius={45}
					pointerEvents='none'
				/>
			) : null}
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					gap: spacing.md,
					padding: spacing.md
				}}
			>
				<MotiView
					animate={{ scale: isPlaying ? 1 : 0.94 }}
					transition={motion.bounce}
				>
					<Artwork
						uri={track.artworkUrl}
						size={64}
						rounded={radius.md}
						elevated
					/>
				</MotiView>
				<View style={{ flex: 1, gap: 2 }}>
					<Text variant='micro' style={{ color: colour.accentBright }}>
						CONTINUE LISTENING
					</Text>
					<Text variant='bodyStrong' numberOfLines={1}>
						{track.title}
					</Text>
					<Text variant='caption' muted numberOfLines={1}>
						{track.artist?.name ?? 'Unknown artist'}
					</Text>
				</View>
				<IconButton
					label={isPlaying ? 'Pause' : 'Play'}
					onPress={onToggle}
					size={52}
				>
					<View
						style={{
							width: 48,
							height: 48,
							borderRadius: 24,
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: colour.accent
						}}
					>
						<MotiView
							key={isPlaying ? 'pause' : 'play'}
							from={{ scale: 0.6, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							transition={motion.bounce}
						>
							{isPlaying ? (
								<PauseIcon size={24} color={colour.onAccent} weight='fill' />
							) : (
								<PlayIcon size={24} color={colour.onAccent} weight='fill' />
							)}
						</MotiView>
					</View>
				</IconButton>
			</View>
			<ProgressBar ratio={ratio} height={3} />
		</PressableScale>
	);
}

/** A horizontal rail of recommendations. */
function Shelf({
	shelf,
	index,
	currentId,
	playing,
	onPlay
}: {
	shelf: HomeShelf;
	index: number;
	currentId?: string;
	playing: boolean;
	onPlay: (track: Track, context: Track[]) => void;
}): ReactElement {
	const first = shelf.tracks[0];

	return (
		<View style={{ gap: spacing.sm }}>
			<SectionHeader
				title={shelf.title}
				actionLabel={first ? 'Play all' : undefined}
				onSeeAll={first ? () => onPlay(first, shelf.tracks) : undefined}
				index={index}
			/>
			{shelf.subtitle ? (
				<Text variant='caption' muted numberOfLines={1}>
					{shelf.subtitle}
				</Text>
			) : null}
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={{
					gap: spacing.md,
					paddingHorizontal: spacing.lg
				}}
				style={{ marginHorizontal: -spacing.lg }}
				decelerationRate='fast'
				snapToInterval={144 + spacing.md}
				snapToAlignment='start'
			>
				{shelf.tracks.map((track, position) => (
					<MediaCard
						key={`${shelf.id}-${track.id}`}
						title={track.title}
						subtitle={track.artist?.name ?? undefined}
						uri={track.artworkUrl}
						size={144}
						revealIndex={position}
						playing={track.id === currentId && playing}
						onPress={() => onPlay(track, shelf.tracks)}
					/>
				))}
			</ScrollView>
		</View>
	);
}

function greeting(): string {
	const hour = new Date().getHours();
	if (hour < 5) return 'Still up?';
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}
