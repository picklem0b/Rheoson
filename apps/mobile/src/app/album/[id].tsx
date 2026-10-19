import type { ReactElement } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { DownloadSimpleIcon } from 'phosphor-react-native';

import { libraryApi } from '@/api/library.api';
import { BackBar } from '@/components/layout/BackBar';
import { Hero } from '@/components/media/Hero';
import { TrackRow } from '@/components/track/TrackRow';
import {
	Button,
	EmptyState,
	ErrorState,
	IconButton,
	Skeleton
} from '@/components/ui';
import { layout, spacing } from '@/constants/theme';
import { useDownloadActions } from '@/hooks/use-download-actions';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { humanError } from '@/lib/errors';
import { formatTotalDuration, formatTrackCount } from '@/lib/formatters';
import { qk } from '@/lib/queryKeys';
import { shuffledCopy } from '@/lib/shuffle';
import { usePlayerStore } from '@/store/player.store';

/**
 * One album.
 *
 * The track order is the server's: it sorts local files by track number and
 * keeps a remote album's own ordering. The screen never re-sorts, because
 * "alphabetical by title" is exactly wrong for an album.
 *
 * Play starts the whole record from the top; Shuffle starts the same list in a
 * random order. Download sends every track the server does not already have to
 * the download queue in one request, which is why the button is here rather
 * than on each row.
 */
export default function AlbumScreen(): ReactElement {
	const router = useRouter();
	const { colour } = useTheme();
	const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
	const { playTrack } = usePlayback();
	const download = useDownloadActions();
	const currentId = usePlayerStore(state => state.currentTrack?.id);

	const query = useQuery({
		queryKey: qk.album(id ?? ''),
		queryFn: () => libraryApi.album(id ?? '', name),
		enabled: Boolean(id)
	});

	const album = query.data;
	const tracks = album?.tracks ?? [];
	const totalDuration = tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
	const meta = [
		album?.releaseYear ? String(album.releaseYear) : album?.year ? String(album.year) : undefined,
		formatTrackCount(tracks.length),
		totalDuration > 0 ? formatTotalDuration(totalDuration) : undefined
	]
		.filter(Boolean)
		.join(' · ');

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }} edges={['top']}>
			<FlatList
				data={tracks}
				keyExtractor={(track, index) => `${track.id}-${index}`}
				contentContainerStyle={{
					paddingHorizontal: spacing.lg,
					paddingBottom: layout.miniPlayer + layout.tabBar + spacing.xxl,
					flexGrow: 1
				}}
				showsVerticalScrollIndicator={false}
				ListHeaderComponent={
					<View style={{ gap: spacing.md }}>
						<BackBar title='Album' />
						{query.isLoading ? (
							<View style={{ gap: spacing.md, alignItems: 'center' }}>
								<Skeleton height={172} width={172} />
								<Skeleton height={28} width='70%' />
								<Skeleton height={16} width='40%' />
							</View>
						) : null}
						{query.error ? (
							<ErrorState
								message={humanError(query.error)}
								onRetry={() => void query.refetch()}
							/>
						) : null}
						{album && !query.error ? (
							<>
								<Hero
									artworkUri={album.artworkUrl}
									title={album.title}
									subtitle={album.artist?.name || undefined}
									onSubtitlePress={
										album.artist?.id && album.artist.id !== 'unknown'
											? () =>
													router.push({
														pathname: '/artist/[id]',
														params: { id: album.artist.id, name: album.artist.name }
													})
											: undefined
									}
									meta={meta}
								/>
								<View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
									<View style={{ flex: 1 }}>
										<Button
											label='Play'
											disabled={tracks.length === 0}
											onPress={() => {
												const first = tracks[0];
												if (first) playTrack(first, tracks, album.title);
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
											if (first) playTrack(first, list, `${album.title}, shuffled`);
										}}
									/>
									<IconButton
										label='Download album'
										onPress={() => download.startBatch(tracks.map(track => track.id))}
									>
										<DownloadSimpleIcon size={22} color={colour.textMuted} />
									</IconButton>
								</View>
							</>
						) : null}
					</View>
				}
				renderItem={({ item, index }) => (
					<TrackRow
						track={item}
						index={index + 1}
						showArtwork={false}
						isPlaying={item.id === currentId}
						onPress={() => playTrack(item, tracks, album?.title ?? 'Album')}
					/>
				)}
				ListEmptyComponent={
					album && !query.isLoading && !query.error ? (
						<EmptyState
							title='No tracks in this album'
							message='The server knows the album but has no playable files for it. Try downloading it from search.'
						/>
					) : null
				}
			/>
		</SafeAreaView>
	);
}
