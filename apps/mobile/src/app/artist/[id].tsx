import type { ReactElement } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { libraryApi } from '@/api/library.api';
import { BackBar } from '@/components/layout/BackBar';
import { Hero } from '@/components/media/Hero';
import { TrackRow } from '@/components/track/TrackRow';
import {
	Artwork,
	Button,
	EmptyState,
	ErrorState,
	ListRow,
	MediaCard,
	SectionHeader,
	Skeleton,
	Text
} from '@/components/ui';
import { layout, radius, spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { humanError } from '@/lib/errors';
import { formatCount } from '@/lib/formatters';
import { qk } from '@/lib/queryKeys';
import { shuffledCopy } from '@/lib/shuffle';
import { toast } from '@/store/toast.store';
import { usePlayerStore } from '@/store/player.store';
import type { Album } from '@rheoson/api-types';

/**
 * An artist page.
 *
 * The server serves this from YouTube Music when it can and from the local file
 * index otherwise, so the same page works for an artist you have downloaded and
 * one you have only streamed. Follow is stored per account; when the upstream
 * lookup did not provide a portrait, the fallback artwork is the first track's
 * cover, because a grey circle reads as a broken image.
 */
export default function ArtistScreen(): ReactElement {
	const router = useRouter();
	const client = useQueryClient();
	const { colour } = useTheme();
	const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
	const { playTrack } = usePlayback();
	const currentId = usePlayerStore(state => state.currentTrack?.id);

	const query = useQuery({
		queryKey: qk.artist(id ?? ''),
		queryFn: () => libraryApi.artist(id ?? '', name),
		enabled: Boolean(id)
	});

	const followStatus = useQuery({
		queryKey: qk.artistFollow(id ?? ''),
		queryFn: () => libraryApi.isFollowing(id ?? ''),
		enabled: Boolean(id),
		staleTime: 60_000
	});

	const follow = useMutation({
		mutationFn: (next: boolean) =>
			next
				? libraryApi.follow(id ?? '', { name, imageUrl: query.data?.imageUrl })
				: libraryApi.unfollow(id ?? ''),
		onSuccess: (_result, next) => {
			void client.invalidateQueries({ queryKey: qk.artistFollow(id ?? '') });
			void client.invalidateQueries({ queryKey: qk.following() });
			toast(next ? 'Following' : 'Unfollowed');
		},
		onError: error => toast(humanError(error, 'Could not change follow'))
	});

	const artist = query.data;
	const tracks = artist?.topTracks ?? [];
	const isFollowing = followStatus.data?.isFollowing ?? false;
	const image = artist?.imageUrl || tracks[0]?.artworkUrl || undefined;
	const meta = [
		artist?.monthlyListeners
			? `${formatCount(artist.monthlyListeners)} monthly listeners`
			: artist?.followers
				? `${formatCount(artist.followers)} followers`
				: undefined,
		artist?.genres?.slice(0, 3).join(' · ') || undefined
	]
		.filter(Boolean)
		.join(' · ');

	const openAlbum = (album: Album): void => {
		router.push({ pathname: '/album/[id]', params: { id: album.id, name: album.title } });
	};

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }} edges={['top']}>
			<ScrollView
				contentContainerStyle={{
					paddingHorizontal: spacing.lg,
					paddingBottom: layout.miniPlayer + layout.tabBar + spacing.xxl,
					gap: spacing.md,
					flexGrow: 1
				}}
				showsVerticalScrollIndicator={false}
			>
				<BackBar title='Artist' />

				{query.isLoading ? (
					<View style={{ gap: spacing.md, alignItems: 'center' }}>
						<Skeleton height={172} width={172} />
						<Skeleton height={28} width='60%' />
						<Skeleton height={16} width='40%' />
					</View>
				) : null}

				{query.error ? (
					<ErrorState message={humanError(query.error)} onRetry={() => void query.refetch()} />
				) : null}

				{artist && !query.error ? (
					<>
						<Hero
							artworkUri={image}
							title={artist.name}
							meta={meta || undefined}
							round
						>
							<View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
								<View style={{ flex: 1 }}>
									<Button
										label='Play popular'
										disabled={tracks.length === 0}
										onPress={() => {
											const first = tracks[0];
											if (first) playTrack(first, tracks, artist.name);
										}}
									/>
								</View>
								<Button
									label='Shuffle'
									variant='secondary'
									disabled={tracks.length === 0}
									onPress={() => {
										const list = shuffledCopy(tracks);
										const first = list[0];
										if (first) playTrack(first, list, `${artist.name}, shuffled`);
									}}
								/>
								<Button
									label={isFollowing ? 'Following' : 'Follow'}
									variant='secondary'
									loading={follow.isPending}
									onPress={() => follow.mutate(!isFollowing)}
								/>
							</View>
						</Hero>

						{tracks.length > 0 ? (
							<>
								<SectionHeader title='Popular' />
								{tracks.slice(0, 10).map((track, index) => (
									<TrackRow
										key={`${track.id}-${index}`}
										track={track}
										index={index + 1}
										showArtwork={false}
										isPlaying={track.id === currentId}
										onPress={() => playTrack(track, tracks, artist.name)}
									/>
								))}
							</>
						) : null}

						{(artist.albums?.length ?? 0) > 0 ? (
							<>
								<SectionHeader title='Albums' />
								<ReleaseRail albums={artist.albums} onPress={openAlbum} />
							</>
						) : null}

						{(artist.singles?.length ?? 0) > 0 ? (
							<>
								<SectionHeader title='Singles and EPs' />
								<ReleaseRail albums={artist.singles} onPress={openAlbum} />
							</>
						) : null}

						{artist.description ? (
							<>
								<SectionHeader title='About' />
								<Text variant='caption' muted numberOfLines={8}>
									{artist.description}
								</Text>
							</>
						) : null}

						{(artist.related?.length ?? 0) > 0 ? (
							<>
								<SectionHeader title='Fans also like' />
								{artist.related.slice(0, 8).map(related => (
									<ListRow
										key={related.id}
										title={related.name}
										leading={
											<Artwork uri={related.imageUrl} size={44} rounded={radius.pill} />
										}
										onPress={() =>
											router.push({
												pathname: '/artist/[id]',
												params: { id: related.id, name: related.name }
											})
										}
									/>
								))}
							</>
						) : null}

						{tracks.length === 0 && (artist.albums?.length ?? 0) === 0 ? (
							<EmptyState
								title='Nothing to play'
								message='The server found this artist but has no tracks for them yet.'
							/>
						) : null}
					</>
				) : null}
			</ScrollView>
		</SafeAreaView>
	);
}

function ReleaseRail({
	albums,
	onPress
}: {
	albums: Album[];
	onPress: (album: Album) => void;
}): ReactElement {
	return (
		<FlatList
			horizontal
			data={albums}
			keyExtractor={(album, index) => `${album.id}-${index}`}
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }}
			renderItem={({ item }) => (
				<MediaCard
					title={item.title}
					subtitle={item.releaseYear ? String(item.releaseYear) : undefined}
					uri={item.artworkUrl}
					size={136}
					onPress={() => onPress(item)}
				/>
			)}
		/>
	);
}
