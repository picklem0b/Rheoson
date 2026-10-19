import { useState, type ReactElement } from 'react';
import { Alert, FlatList, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CaretRightIcon, PlusIcon } from 'phosphor-react-native';

import { libraryApi } from '@/api/library.api';
import { playlistsApi, type Playlist } from '@/api/playlists.api';
import { tracksApi } from '@/api/tracks.api';
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
	MediaCard,
	Sheet,
	Skeleton
} from '@/components/ui';
import { layout, radius, spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { humanError } from '@/lib/errors';
import { formatTrackCount } from '@/lib/formatters';
import { qk } from '@/lib/queryKeys';
import { shuffledCopy } from '@/lib/shuffle';
import { usePlayerStore } from '@/store/player.store';
import { toast } from '@/store/toast.store';
import type { Album, Artist, Track } from '@rheoson/api-types';

type Section = 'playlists' | 'liked' | 'albums' | 'artists' | 'recent';

const SECTIONS: { key: Section; label: string }[] = [
	{ key: 'playlists', label: 'Playlists' },
	{ key: 'liked', label: 'Favourites' },
	{ key: 'albums', label: 'Albums' },
	{ key: 'artists', label: 'Artists' },
	{ key: 'recent', label: 'Recent' }
];

/**
 * Your library: the things you chose.
 *
 * Five sections rather than five tabs. A phone bottom bar has room for four
 * destinations, and all of these answer the same question — "what did I keep?"
 * — so they share one screen and one header, and switching between them is a
 * tap on a chip instead of a tab-stack reset.
 *
 * Only the open section is fetched. The others are seeded from the offline
 * mirror, so coming back to a section you visited on Wi-Fi shows it instantly
 * and revalidates behind that.
 */
export default function LibraryScreen(): ReactElement {
	const router = useRouter();
	const client = useQueryClient();
	const { colour } = useTheme();
	const { width } = useWindowDimensions();
	const { playTrack } = usePlayback();
	const currentId = usePlayerStore(state => state.currentTrack?.id);

	const [section, setSection] = useState<Section>('playlists');
	const [creating, setCreating] = useState(false);
	const [title, setTitle] = useState('');

	const playlists = useQuery({
		queryKey: qk.playlists(),
		queryFn: () => playlistsApi.list(),
		enabled: section === 'playlists'
	});
	const liked = useQuery({
		queryKey: qk.likedTracks(),
		queryFn: () => tracksApi.liked(),
		enabled: section === 'liked'
	});
	const albums = useQuery({
		queryKey: qk.libraryAlbums(),
		queryFn: () => libraryApi.albums(),
		enabled: section === 'albums'
	});
	const artists = useQuery({
		queryKey: qk.libraryArtists(),
		queryFn: () => libraryApi.artists(),
		enabled: section === 'artists'
	});
	const recent = useQuery({
		queryKey: qk.recentlyPlayedFull(),
		queryFn: () => tracksApi.recentlyPlayed(50),
		enabled: section === 'recent'
	});

	const active = {
		playlists,
		liked,
		albums,
		artists,
		recent
	}[section];

	const create = useMutation({
		mutationFn: (name: string) => playlistsApi.create(name),
		onSuccess: () => {
			void client.invalidateQueries({ queryKey: qk.playlists() });
			toast('Playlist created');
			setCreating(false);
			setTitle('');
		},
		onError: error => toast(humanError(error, 'Could not create the playlist'))
	});

	const clearHistory = useMutation({
		mutationFn: () => tracksApi.clearHistory(),
		onSuccess: () => {
			void client.invalidateQueries({ queryKey: qk.recentlyPlayed() });
			void client.invalidateQueries({ queryKey: qk.recentlyPlayedFull() });
			void client.invalidateQueries({ queryKey: qk.home() });
			toast('History cleared');
		},
		onError: error => toast(humanError(error, 'Could not clear history'))
	});

	const confirmClearHistory = (): void => {
		Alert.alert(
			'Clear listening history?',
			'This removes what the server remembers you played. It cannot be undone.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{ text: 'Clear', style: 'destructive', onPress: () => clearHistory.mutate() }
			]
		);
	};

	const albumSize = (width - spacing.lg * 2 - spacing.md) / 2;
	const tracks: Track[] = section === 'liked' ? (liked.data ?? []) : (recent.data ?? []);

	const header = (
		<View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
			<AppBar
				title='Your library'
				subtitle='Saved, followed and played on this account'
				action={
					section === 'playlists' ? (
						<IconButton label='New playlist' onPress={() => setCreating(true)}>
							<PlusIcon size={22} color={colour.text} />
						</IconButton>
					) : undefined
				}
			/>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
				style={{ marginHorizontal: -spacing.lg }}
			>
				{SECTIONS.map(item => (
					<Chip
						key={item.key}
						label={item.label}
						active={section === item.key}
						onPress={() => setSection(item.key)}
					/>
				))}
			</ScrollView>

			{section === 'liked' && (liked.data?.length ?? 0) > 0 ? (
				<View style={{ flexDirection: 'row', gap: spacing.sm }}>
					<View style={{ flex: 1 }}>
						<Button
							label={`Play all · ${liked.data?.length ?? 0}`}
							onPress={() => {
								const first = liked.data?.[0];
								if (first) playTrack(first, liked.data, 'Favourites');
							}}
						/>
					</View>
					<Button
						label='Shuffle'
						variant='secondary'
						onPress={() => {
							const list = shuffledCopy(liked.data ?? []);
							const first = list[0];
							if (first) playTrack(first, list, 'Favourites, shuffled');
						}}
					/>
				</View>
			) : null}

			{section === 'recent' && (recent.data?.length ?? 0) > 0 ? (
				<Button
					label='Clear history'
					variant='secondary'
					onPress={confirmClearHistory}
					loading={clearHistory.isPending}
				/>
			) : null}

			{active.isLoading ? (
				<View style={{ gap: spacing.sm }}>
					<Skeleton height={64} />
					<Skeleton height={64} />
					<Skeleton height={64} />
				</View>
			) : null}

			{active.error ? (
				<ErrorState message={humanError(active.error)} onRetry={() => void active.refetch()} />
			) : null}
		</View>
	);

	const padding = {
		paddingHorizontal: spacing.lg,
		paddingBottom: layout.miniPlayer + layout.tabBar + spacing.xxl,
		flexGrow: 1
	};

	if (section === 'albums') {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }} edges={['top']}>
				<FlatList
					key='albums'
					data={albums.data ?? []}
					numColumns={2}
					keyExtractor={album => album.id}
					ListHeaderComponent={header}
					columnWrapperStyle={{ gap: spacing.md }}
					contentContainerStyle={padding}
					showsVerticalScrollIndicator={false}
					renderItem={({ item }) => (
						<AlbumCard
							album={item}
							size={albumSize}
							onPress={() =>
								router.push({
									pathname: '/album/[id]',
									params: { id: item.id, name: item.title }
								})
							}
						/>
					)}
					ListEmptyComponent={
						!albums.isLoading && !albums.error ? (
							<EmptyState
								title='No albums yet'
								message='Anything you download lands here with its cover and track list.'
								action={<Button label='Find music' onPress={() => router.push('/search')} />}
							/>
						) : null
					}
				/>
			</SafeAreaView>
		);
	}

	if (section === 'artists') {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }} edges={['top']}>
				<FlatList
					data={artists.data ?? []}
					keyExtractor={artist => artist.id}
					ListHeaderComponent={header}
					contentContainerStyle={padding}
					showsVerticalScrollIndicator={false}
					renderItem={({ item }) => (
						<ArtistRow
							artist={item}
							onPress={() =>
								router.push({
									pathname: '/artist/[id]',
									params: { id: item.id, name: item.name }
								})
							}
						/>
					)}
					ListEmptyComponent={
						!artists.isLoading && !artists.error ? (
							<EmptyState
								title='No artists yet'
								message='Artists appear with the first track you keep or download.'
							/>
						) : null
					}
				/>
			</SafeAreaView>
		);
	}

	if (section === 'playlists') {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }} edges={['top']}>
				<FlatList
					data={playlists.data ?? []}
					keyExtractor={playlist => playlist.id}
					ListHeaderComponent={header}
					contentContainerStyle={padding}
					showsVerticalScrollIndicator={false}
					renderItem={({ item }) => (
						<PlaylistRow
							playlist={item}
							onPress={() =>
								router.push({ pathname: '/playlist/[id]', params: { id: item.id } })
							}
						/>
					)}
					ListEmptyComponent={
						!playlists.isLoading && !playlists.error ? (
							<EmptyState
								title='Start a playlist'
								message='A playlist is yours alone and follows the account between the web and this phone.'
								action={<Button label='New playlist' onPress={() => setCreating(true)} />}
							/>
						) : null
					}
				/>

				<Sheet
					visible={creating}
					onClose={() => {
						setCreating(false);
						setTitle('');
					}}
					title='New playlist'
				>
					<View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
						<Field
							value={title}
							onChangeText={setTitle}
							placeholder='Playlist name'
							autoFocus
							maxLength={80}
							onSubmitEditing={() => {
								if (title.trim()) create.mutate(title.trim());
							}}
						/>
						<Button
							label='Create'
							disabled={!title.trim()}
							loading={create.isPending}
							onPress={() => create.mutate(title.trim())}
						/>
					</View>
				</Sheet>
			</SafeAreaView>
		);
	}

	// Favourites and Recent are both track lists.
	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colour.background }} edges={['top']}>
			<FlatList
				data={tracks}
				keyExtractor={(track, index) => `${track.id}-${index}`}
				ListHeaderComponent={header}
				contentContainerStyle={padding}
				showsVerticalScrollIndicator={false}
				renderItem={({ item }) => (
					<TrackRow
						track={item}
						isPlaying={item.id === currentId}
						onPress={() =>
							playTrack(item, tracks, section === 'liked' ? 'Favourites' : 'Recently played')
						}
					/>
				)}
				ListEmptyComponent={
					!active.isLoading && !active.error ? (
						<EmptyState
							title={section === 'liked' ? 'Nothing saved yet' : 'No listening history'}
							message={
								section === 'liked'
									? 'Tap the heart on any track and it is kept here, on every device you sign into.'
									: 'Tracks you play show up here, newest first.'
							}
							action={<Button label='Find music' onPress={() => router.push('/search')} />}
						/>
					) : null
				}
			/>
		</SafeAreaView>
	);
}

function AlbumCard({
	album,
	size,
	onPress
}: {
	album: Album;
	size: number;
	onPress: () => void;
}): ReactElement {
	return (
		<MediaCard
			title={album.title}
			subtitle={album.artist?.name || undefined}
			uri={album.artworkUrl}
			size={size}
			onPress={onPress}
		/>
	);
}

function ArtistRow({
	artist,
	onPress
}: {
	artist: Artist & { trackCount?: number };
	onPress: () => void;
}): ReactElement {
	const { colour } = useTheme();
	return (
		<ListRow
			title={artist.name}
			subtitle={artist.trackCount ? formatTrackCount(artist.trackCount) : 'Artist'}
			leading={<Artwork uri={artist.imageUrl} size={48} rounded={radius.pill} />}
			trailing={<CaretRightIcon size={18} color={colour.textMuted} />}
			onPress={onPress}
		/>
	);
}

function PlaylistRow({ playlist, onPress }: { playlist: Playlist; onPress: () => void }): ReactElement {
	const { colour } = useTheme();
	return (
		<ListRow
			title={playlist.title}
			subtitle={formatTrackCount(playlist.trackCount)}
			leading={<Artwork uri={playlist.artworkUrl} size={48} />}
			trailing={<CaretRightIcon size={18} color={colour.textMuted} />}
			onPress={onPress}
		/>
	);
}
