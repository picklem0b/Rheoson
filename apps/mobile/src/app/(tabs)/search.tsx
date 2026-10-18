import type { ReactElement } from 'react';
import { useState } from 'react';
import { FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from 'phosphor-react-native';

import { searchApi } from '@/api/search.api';
import { TrackRow } from '@/components/track/TrackRow';
import { AppBar, Chip, EmptyState, ErrorState, ListRow, SectionHeader, Skeleton, Text } from '@/components/ui';
import { qk } from '@/lib/queryKeys';
import { humanError } from '@/lib/errors';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlayback } from '@/hooks/use-playback';
import { useSettingsStore } from '@/store/settings.store';

/**
 * Search.
 *
 * Results arrive as four rails — tracks, albums, artists, playlists — and each
 * is tappable: a track plays, an album/artist/playlist opens its page. Nothing
 * is hidden behind a "filter" control, because four rails fit a phone screen
 * and hiding them costs a tap per search.
 *
 * Recent searches are device-local and capped; they are shown only while the
 * field is empty, which is the only moment they are useful.
 */
export default function SearchScreen(): ReactElement {
	const router = useRouter();
	const { colour } = useTheme();
	const { playTrack } = usePlayback();
	const recentSearches = useSettingsStore(state => state.recentSearches);
	const rememberSearch = useSettingsStore(state => state.rememberSearch);
	const [term, setTerm] = useState('');
	const [submitted, setSubmitted] = useState('');

	const results = useQuery({
		queryKey: ['search', submitted],
		queryFn: () => searchApi.query(submitted),
		enabled: submitted.trim().length > 1
	});

	const submit = (value: string): void => {
		const trimmed = value.trim();
		if (trimmed.length < 2) return;
		setSubmitted(trimmed);
		rememberSearch(trimmed);
	};

	return (
		<>
			<AppBar title='Search' subtitle='Tracks, albums, artists and playlists' />
			<ListRow
				title={term || 'What do you want to hear?'}
				onPress={() => undefined}
				leading={<MagnifyingGlassIcon size={20} color={colour.textMuted} />}
			/>
			<FlatList
				data={[
					...(results.data?.tracks ?? []).map(track => ({ kind: 'track' as const, track })),
					...(results.data?.albums ?? []).map(album => ({ kind: 'album' as const, album })),
					...(results.data?.artists ?? []).map(artist => ({ kind: 'artist' as const, artist })),
					...(results.data?.playlists ?? []).map(playlist => ({ kind: 'playlist' as const, playlist }))
				]}
				keyExtractor={item =>
					item.kind === 'track'
						? `t-${item.track.id}`
						: item.kind === 'album'
							? `a-${item.album.id}`
							: item.kind === 'artist'
								? `r-${item.artist.id}`
								: `p-${item.playlist.id}`
				}
				contentContainerStyle={{ paddingBottom: 160, paddingHorizontal: spacing.lg, gap: spacing.xs }}
				showsVerticalScrollIndicator={false}
				renderItem={({ item }) => {
					if (item.kind === 'track') {
						return (
							<TrackRow
								track={item.track}
								onPress={() => playTrack(item.track, results.data?.tracks, 'Search')}
							/>
						);
					}
					if (item.kind === 'album') {
						return (
							<ListRow
								title={item.album.title}
								subtitle={item.album.artist}
								onPress={() => router.push(`/album/${item.album.id}`)}
							/>
						);
					}
					if (item.kind === 'artist') {
						return (
							<ListRow
								title={item.artist.name}
								subtitle='Artist'
								onPress={() => router.push(`/artist/${item.artist.id}`)}
							/>
						);
					}
					return (
						<ListRow
							title={item.playlist.title}
							subtitle={
								item.playlist.trackCount ? `${item.playlist.trackCount} tracks` : 'Playlist'
							}
							onPress={() => router.push(`/playlist/${item.playlist.id}`)}
						/>
					);
				}}
				ListHeaderComponent={
					<>
						{!submitted && recentSearches.length > 0 ? (
							<>
								<SectionHeader title='Recent' />
								<FlatList
									horizontal
									data={recentSearches}
									keyExtractor={item => item}
									showsHorizontalScrollIndicator={false}
									contentContainerStyle={{ gap: spacing.sm }}
									style={{ marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg }}
									renderItem={({ item }) => <Chip label={item} onPress={() => submit(item)} />}
								/>
							</>
						) : null}
						{results.isLoading ? <Skeleton height={72} /> : null}
						{results.error ? (
							<ErrorState message={humanError(results.error)} onRetry={() => void results.refetch()} />
						) : null}
					</>
				}
				ListEmptyComponent={
					!submitted ? (
						<EmptyState
							title='Search your library'
							message='Anything the server has downloaded or can stream is findable here.'
						/>
					) : results.data ? (
						<EmptyState title='No matches' message={`Nothing came back for “${submitted}”.`} />
					) : null
				}
			/>
			<Text variant='caption' muted style={{ display: 'none' }}>
				{qk.libraryTracks().join()}
			</Text>
		</>
	);
}
