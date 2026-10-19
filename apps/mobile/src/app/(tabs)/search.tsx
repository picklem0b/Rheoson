import { useEffect, useState, type ReactElement } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon, XCircleIcon } from 'phosphor-react-native';

import { searchApi, type SearchCategory } from '@/api/search.api';
import { TrackRow } from '@/components/track/TrackRow';
import {
	AppBar,
	Artwork,
	Button,
	Chip,
	EmptyState,
	ErrorState,
	Field,
	IconButton,
	ListRow,
	SectionHeader,
	Skeleton,
	Text
} from '@/components/ui';
import { layout, radius, spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { humanError } from '@/lib/errors';
import { qk } from '@/lib/queryKeys';
import { usePlayerStore } from '@/store/player.store';
import { useSettingsStore } from '@/store/settings.store';

/**
 * Search.
 *
 * It searches while you type, after a short pause — the results update under
 * the field, and there is no "submit" step to forget. The keyboard's search
 * key still works, and it is what records the term in recent searches, so the
 * history only holds things someone meant to find.
 *
 * With an empty field the screen is a browse surface: recent searches first,
 * then the server's category grid, which is the only way to find music without
 * already knowing what it is called.
 *
 * `?q=` is read from the URL so a shared link (`rheoson://search?q=…`) opens
 * with that search already running.
 */
export default function SearchScreen(): ReactElement {
	const router = useRouter();
	const { colour } = useTheme();
	const { playTrack } = usePlayback();
	const params = useLocalSearchParams<{ q?: string }>();

	const recentSearches = useSettingsStore(state => state.recentSearches);
	const rememberSearch = useSettingsStore(state => state.rememberSearch);
	const clearSearches = useSettingsStore(state => state.clearSearches);
	const currentId = usePlayerStore(state => state.currentTrack?.id);

	const [term, setTerm] = useState(typeof params.q === 'string' ? params.q : '');
	const [category, setCategory] = useState<SearchCategory | null>(null);
	const settled = useDebounced(term.trim(), 300);

	useEffect(() => {
		if (typeof params.q === 'string' && params.q) {
			setTerm(params.q);
			setCategory(null);
		}
	}, [params.q]);

	const results = useQuery({
		queryKey: ['search', settled],
		queryFn: () => searchApi.query(settled),
		enabled: settled.length > 1 && !category
	});

	const categories = useQuery({
		queryKey: qk.searchCategories(),
		queryFn: searchApi.categories,
		staleTime: 10 * 60_000
	});

	const categoryTop = useQuery({
		queryKey: qk.categoryTop(category?.slug ?? ''),
		queryFn: () => searchApi.categoryTop(category?.slug ?? ''),
		enabled: Boolean(category)
	});

	const submit = (): void => {
		const trimmed = term.trim();
		if (trimmed.length > 1) rememberSearch(trimmed);
		Keyboard.dismiss();
	};

	const data = results.data;
	const tracks = data?.tracks ?? [];
	const showBrowse = !term.trim() && !category;
	const nothing =
		Boolean(data) &&
		tracks.length === 0 &&
		(data?.albums.length ?? 0) === 0 &&
		(data?.artists.length ?? 0) === 0 &&
		(data?.playlists.length ?? 0) === 0;

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }} edges={['top']}>
			<ScrollView
				contentContainerStyle={{
					paddingHorizontal: spacing.lg,
					paddingBottom: layout.miniPlayer + layout.tabBar + spacing.xxl,
					gap: spacing.md
				}}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps='handled'
				keyboardDismissMode='on-drag'
			>
				<AppBar title='Search' subtitle='Tracks, albums, artists and playlists' />

				<View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
					<View style={{ flex: 1 }}>
						<Field
							value={term}
							onChangeText={value => {
								setTerm(value);
								if (category) setCategory(null);
							}}
							placeholder='What do you want to hear?'
							returnKeyType='search'
							onSubmitEditing={submit}
							accessibilityLabel='Search your library'
						/>
					</View>
					{term ? (
						<IconButton
							label='Clear search'
							onPress={() => {
								setTerm('');
								setCategory(null);
							}}
						>
							<XCircleIcon size={22} color={colour.textMuted} />
						</IconButton>
					) : (
						<IconButton label='Search' onPress={submit}>
							<MagnifyingGlassIcon size={22} color={colour.textMuted} />
						</IconButton>
					)}
				</View>

				{showBrowse ? (
					<>
						{recentSearches.length > 0 ? (
							<View style={{ gap: spacing.sm }}>
								<SectionHeader
									title='Recent'
									actionLabel='Clear'
									onSeeAll={clearSearches}
								/>
								<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
									{recentSearches.map(item => (
										<Chip key={item} label={item} onPress={() => setTerm(item)} />
									))}
								</View>
							</View>
						) : null}

						<SectionHeader title='Browse' />
						{categories.isLoading ? <Skeleton height={40} /> : null}
						{categories.error ? (
							<ErrorState
								message={humanError(categories.error)}
								onRetry={() => void categories.refetch()}
							/>
						) : null}
						<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
							{categories.data?.map(item => (
								<Chip
									key={item.slug}
									label={item.title}
									onPress={() => {
										setCategory(item);
										setTerm('');
									}}
								/>
							))}
						</View>

						<EmptyState
							title='Find something to play'
							message='Anything the server has downloaded or can stream is searchable here.'
						/>
					</>
				) : null}

				{category ? (
					<>
						<View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
							<Chip label={category.title} active onPress={() => setCategory(null)} />
							<Text variant='caption' muted>
								Top tracks this week
							</Text>
						</View>
						{categoryTop.isLoading ? <Skeleton height={72} /> : null}
						{categoryTop.error ? (
							<ErrorState
								message={humanError(categoryTop.error)}
								onRetry={() => void categoryTop.refetch()}
							/>
						) : null}
						{categoryTop.data?.map(track => (
							<TrackRow
								key={track.id}
								track={track}
								isPlaying={track.id === currentId}
								onPress={() => playTrack(track, categoryTop.data, category.title)}
							/>
						))}
						{categoryTop.data?.length === 0 && !categoryTop.isLoading ? (
							<EmptyState
								title='Nothing in this category'
								message='The weekly chart for it came back empty. Try another category.'
							/>
						) : null}
					</>
				) : null}

				{!showBrowse && !category ? (
					<>
						{results.isLoading ? (
							<View style={{ gap: spacing.sm }}>
								<Skeleton height={64} />
								<Skeleton height={64} />
								<Skeleton height={64} />
							</View>
						) : null}
						{results.error ? (
							<ErrorState
								message={humanError(results.error)}
								onRetry={() => void results.refetch()}
							/>
						) : null}

						{tracks.length > 0 ? (
							<>
								<SectionHeader title='Tracks' />
								{tracks.map(track => (
									<TrackRow
										key={track.id}
										track={track}
										isPlaying={track.id === currentId}
										onPress={() => playTrack(track, tracks, 'Search')}
									/>
								))}
							</>
						) : null}

						{(data?.albums.length ?? 0) > 0 ? (
							<>
								<SectionHeader title='Albums' />
								{data?.albums.map(album => (
									<ListRow
										key={album.id}
										title={album.title}
										subtitle={album.artist}
										leading={<Artwork uri={album.artworkUrl} size={44} />}
										onPress={() =>
											router.push({
												pathname: '/album/[id]',
												params: { id: album.id, name: album.title }
											})
										}
									/>
								))}
							</>
						) : null}

						{(data?.artists.length ?? 0) > 0 ? (
							<>
								<SectionHeader title='Artists' />
								{data?.artists.map(artist => (
									<ListRow
										key={artist.id}
										title={artist.name}
										subtitle='Artist'
										leading={<Artwork uri={artist.imageUrl} size={44} rounded={radius.pill} />}
										onPress={() =>
											router.push({
												pathname: '/artist/[id]',
												params: { id: artist.id, name: artist.name }
											})
										}
									/>
								))}
							</>
						) : null}

						{(data?.playlists.length ?? 0) > 0 ? (
							<>
								<SectionHeader title='Playlists' />
								{data?.playlists.map(playlist => (
									<ListRow
										key={playlist.id}
										title={playlist.title}
										subtitle={
											playlist.trackCount
												? `${playlist.trackCount} ${playlist.trackCount === 1 ? 'track' : 'tracks'}`
												: 'Playlist'
										}
										leading={<Artwork uri={playlist.artworkUrl} size={44} />}
										onPress={() =>
											router.push({ pathname: '/playlist/[id]', params: { id: playlist.id } })
										}
									/>
								))}
							</>
						) : null}

						{nothing ? (
							<EmptyState
								title='No matches'
								message={`Nothing came back for “${settled}”. Try fewer words, or browse a category.`}
								action={
									<Button
										label='Browse categories'
										variant='secondary'
										onPress={() => setTerm('')}
									/>
								}
							/>
						) : null}
					</>
				) : null}
			</ScrollView>
		</SafeAreaView>
	);
}
