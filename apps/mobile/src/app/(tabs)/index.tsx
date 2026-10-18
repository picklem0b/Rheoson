import type { ReactElement } from 'react';
import { FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { GearIcon } from 'phosphor-react-native';

import { libraryApi } from '@/api/library.api';
import { recommendationsApi, type HomeShelf } from '@/api/recommendations.api';
import { tracksApi } from '@/api/tracks.api';
import { TrackRow } from '@/components/track/TrackRow';
import { AppBar, Artwork, Button, EmptyState, ErrorState, IconButton, SectionHeader, Skeleton, Text } from '@/components/ui';
import { qk } from '@/lib/queryKeys';
import { humanError } from '@/lib/errors';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlayback } from '@/hooks/use-playback';
import type { Track } from '@rheoson/api-types';

/**
 * Home: what to play right now.
 *
 * Three rails and nothing else — recently played, the server's picks, and what
 * is trending this week. A phone home screen is a starting point, not a
 * catalogue: anything that needs browsing belongs behind Search or Library, and
 * every rail here is one tap from playing.
 */
export default function HomeScreen(): ReactElement {
	const router = useRouter();
	const { colour } = useTheme();
	const { playTrack } = usePlayback();

	const recent = useQuery({ queryKey: qk.recentlyPlayed(), queryFn: () => tracksApi.recentlyPlayed(12) });
	const shelves = useQuery({ queryKey: qk.home(), queryFn: () => recommendationsApi.home() });
	const weekly = useQuery({ queryKey: qk.trendingWeekly(), queryFn: () => tracksApi.trendingWeekly(10) });

	const loading = recent.isLoading && shelves.isLoading && weekly.isLoading;
	const failure = recent.error ?? shelves.error ?? weekly.error;

	return (
		<FlatList
			data={[{ key: 'body' }]}
			keyExtractor={item => item.key}
			showsVerticalScrollIndicator={false}
			contentContainerStyle={{ paddingBottom: 160 }}
			renderItem={() => (
				<>
					<AppBar
						title='Good to see you'
						subtitle='Your library, ready to play'
						action={
							<IconButton label='Settings' onPress={() => router.push('/settings')}>
								<GearIcon size={22} color={colour.textMuted} />
							</IconButton>
						}
					/>

					{loading ? (
						<>
							<Skeleton height={72} />
							<Skeleton height={160} />
							<Skeleton height={72} />
						</>
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

					{recent.data && recent.data.length > 0 ? (
						<>
							<SectionHeader title='Jump back in' />
							{recent.data.slice(0, 5).map(track => (
								<TrackRow
									key={`recent-${track.id}`}
									track={track}
									onPress={() => playTrack(track, recent.data, 'Recently played')}
								/>
							))}
						</>
					) : null}

					{shelves.data?.map(shelf => (
						<Shelf
							key={shelf.id}
							shelf={shelf}
							onPlay={(track, context) => playTrack(track, context, shelf.title)}
						/>
					))}

					{weekly.data && weekly.data.length > 0 ? (
						<>
							<SectionHeader title='Trending this week' />
							{weekly.data.slice(0, 5).map(track => (
								<TrackRow
									key={`weekly-${track.id}`}
									track={track}
									onPress={() => playTrack(track, weekly.data, 'Trending this week')}
								/>
							))}
						</>
					) : null}

					{!loading && !failure && !recent.data?.length && !shelves.data?.length ? (
						<EmptyState
							title='Nothing here yet'
							message='Play something from Search or Library and this page starts filling in.'
							action={<Button label='Find music' variant='secondary' onPress={() => router.push('/search')} />}
						/>
					) : null}
				</>
			)}
		/>
	);
}

/** A horizontal rail of recommendations. */
function Shelf({ shelf, onPlay }: { shelf: HomeShelf; onPlay: (track: Track, context: Track[]) => void }): ReactElement {
	const { colour } = useTheme();

	return (
		<>
			<SectionHeader title={shelf.title} />
			<FlatList
				horizontal
				data={shelf.tracks}
				keyExtractor={track => `${shelf.id}-${track.id}`}
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={{ gap: spacing.md }}
				style={{ marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg }}
				renderItem={({ item }) => (
					<Button
						label={item.title}
						variant='ghost'
						onPress={() => onPlay(item, shelf.tracks)}
					/>
				)}
				ListHeaderComponent={
					<Text variant='caption' muted>
						{shelf.subtitle ?? ''}
					</Text>
				}
			/>
		</>
	);
}
