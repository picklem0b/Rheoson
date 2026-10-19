import { useState, type ReactElement } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { GearIcon, PauseIcon, PlayIcon } from 'phosphor-react-native';

import { recommendationsApi, type HomeShelf } from '@/api/recommendations.api';
import { tracksApi } from '@/api/tracks.api';
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
import { layout, radius, spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { humanError } from '@/lib/errors';
import { qk } from '@/lib/queryKeys';
import { usePlayerStore } from '@/store/player.store';
import type { Track } from '@rheoson/api-types';

/**
 * Home: what to play right now.
 *
 * Three rails and a continue card. A phone home screen is a starting point, not
 * a catalogue: anything that needs browsing belongs behind Search or Library,
 * and every rail here is one tap from playing. The shelves are artwork cards
 * rather than a list of titles because cover art is how people find the thing
 * they meant to play.
 *
 * Pull to refresh is the one gesture people try without being told, so it
 * refetches all three rails at once.
 */
export default function HomeScreen(): ReactElement {
	const router = useRouter();
	const { colour } = useTheme();
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
	const shelves = useQuery({ queryKey: qk.home(), queryFn: () => recommendationsApi.home() });
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

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }} edges={['top']}>
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
					/>
				}
			>
				<AppBar
					title={greeting()}
					subtitle='Your library, ready to play'
					action={
						<IconButton label='Settings' onPress={() => router.push('/settings')}>
							<GearIcon size={22} color={colour.textMuted} />
						</IconButton>
					}
				/>

				{loading ? (
					<View style={{ gap: spacing.sm }}>
						<Skeleton height={96} />
						<Skeleton height={200} />
						<Skeleton height={72} />
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

				{current ? (
					<ContinueCard
						track={current}
						isPlaying={isPlaying}
						progress={progress}
						duration={duration}
						onOpen={() => router.push('/player')}
						onToggle={toggle}
					/>
				) : null}

				{recent.data && recent.data.length > 0 ? (
					<>
						<SectionHeader title='Jump back in' />
						{recent.data.slice(0, 4).map(track => (
							<TrackRow
								key={`recent-${track.id}`}
								track={track}
								isPlaying={track.id === current?.id}
								onPress={() => playTrack(track, recent.data, 'Recently played')}
							/>
						))}
					</>
				) : null}

				{shelves.data?.map(shelf => (
					<Shelf
						key={shelf.id}
						shelf={shelf}
						currentId={current?.id}
						onPlay={(track, context) => playTrack(track, context, shelf.title)}
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
								isPlaying={track.id === current?.id}
								onPress={() => playTrack(track, weekly.data, 'Trending this week')}
							/>
						))}
					</>
				) : null}

				{empty ? (
					<EmptyState
						title='Nothing here yet'
						message='Play something from Search or Library and this page starts filling in.'
						action={<Button label='Find music' variant='secondary' onPress={() => router.push('/search')} />}
					/>
				) : null}
			</ScrollView>
		</SafeAreaView>
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
		<Pressable
			onPress={onOpen}
			accessibilityRole='button'
			accessibilityLabel={`Open the player for ${track.title}`}
			style={({ pressed }) => ({
				backgroundColor: colour.player,
				borderRadius: radius.lg,
				borderWidth: 0.5,
				borderColor: colour.border,
				overflow: 'hidden',
				opacity: pressed ? 0.9 : 1
			})}
		>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md }}>
				<Artwork uri={track.artworkUrl} size={56} />
				<View style={{ flex: 1 }}>
					<Text variant='micro' muted>
						CONTINUE LISTENING
					</Text>
					<Text variant='bodyStrong' numberOfLines={1}>
						{track.title}
					</Text>
					<Text variant='caption' muted numberOfLines={1}>
						{track.artist?.name ?? 'Unknown artist'}
					</Text>
				</View>
				<IconButton label={isPlaying ? 'Pause' : 'Play'} onPress={onToggle}>
					{isPlaying ? (
						<PauseIcon size={26} color={colour.text} weight='fill' />
					) : (
						<PlayIcon size={26} color={colour.text} weight='fill' />
					)}
				</IconButton>
			</View>
			<ProgressBar ratio={ratio} height={3} />
		</Pressable>
	);
}

/** A horizontal rail of recommendations. */
function Shelf({
	shelf,
	currentId,
	onPlay
}: {
	shelf: HomeShelf;
	currentId?: string;
	onPlay: (track: Track, context: Track[]) => void;
}): ReactElement {
	const first = shelf.tracks[0];

	return (
		<View style={{ gap: spacing.sm }}>
			<SectionHeader
				title={shelf.title}
				actionLabel={first ? 'Play all' : undefined}
				onSeeAll={first ? () => onPlay(first, shelf.tracks) : undefined}
			/>
			{shelf.subtitle ? (
				<Text variant='caption' muted numberOfLines={1}>
					{shelf.subtitle}
				</Text>
			) : null}
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }}
				style={{ marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg }}
			>
				{shelf.tracks.map(track => (
					<MediaCard
						key={`${shelf.id}-${track.id}`}
						title={track.title}
						subtitle={track.artist?.name ?? undefined}
						uri={track.artworkUrl}
						size={144}
						onPress={() => onPlay(track, shelf.tracks)}
						badge={
							track.id === currentId ? (
								<View
									style={{
										position: 'absolute',
										left: spacing.sm,
										top: spacing.sm,
										backgroundColor: 'rgba(0,0,0,0.65)',
										borderRadius: radius.pill,
										paddingHorizontal: spacing.sm,
										paddingVertical: 2
									}}
								>
									<Text variant='micro' style={{ color: '#FFFFFF' }}>
										PLAYING
									</Text>
								</View>
							) : undefined
						}
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
