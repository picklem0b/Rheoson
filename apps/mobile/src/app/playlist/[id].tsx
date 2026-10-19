import { useState, type ReactElement } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DotsThreeIcon } from 'phosphor-react-native';

import { playlistsApi } from '@/api/playlists.api';
import { BackBar } from '@/components/layout/BackBar';
import { Hero } from '@/components/media/Hero';
import { TrackRow } from '@/components/track/TrackRow';
import {
	Button,
	EmptyState,
	ErrorState,
	Field,
	IconButton,
	ListRow,
	Sheet,
	Skeleton,
	Text
} from '@/components/ui';
import { layout, spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { humanError } from '@/lib/errors';
import { formatTotalDuration, formatTrackCount } from '@/lib/formatters';
import { qk } from '@/lib/queryKeys';
import { shuffledCopy } from '@/lib/shuffle';
import { openTrackMenu } from '@/store/sheet.store';
import { toast } from '@/store/toast.store';
import { usePlayerStore } from '@/store/player.store';

/**
 * One playlist.
 *
 * Removing a track is deliberately not a row button: it lives in the shared
 * track menu, which is what a long press opens anywhere in the app. That keeps
 * the row about playing the track and puts the destructive action one
 * deliberate step away.
 *
 * Rename and delete are the playlist's own, so they sit behind the header's
 * menu rather than taking permanent space at the top of every playlist.
 */
export default function PlaylistScreen(): ReactElement {
	const router = useRouter();
	const client = useQueryClient();
	const { colour } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const { playTrack } = usePlayback();
	const currentId = usePlayerStore(state => state.currentTrack?.id);

	const [optionsOpen, setOptionsOpen] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [title, setTitle] = useState('');

	const query = useQuery({
		queryKey: qk.playlist(id ?? ''),
		queryFn: () => playlistsApi.get(id ?? ''),
		enabled: Boolean(id)
	});

	const playlist = query.data;
	const tracks = playlist?.tracks ?? [];
	const totalDuration = tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
	const artwork = playlist?.artworkUrl || tracks[0]?.artworkUrl || undefined;

	const invalidate = (): void => {
		void client.invalidateQueries({ queryKey: qk.playlistAll() });
		void client.invalidateQueries({ queryKey: qk.playlists() });
	};

	const rename = useMutation({
		mutationFn: (next: string) => playlistsApi.rename(id ?? '', next),
		onSuccess: () => {
			invalidate();
			setRenaming(false);
			setOptionsOpen(false);
			toast('Playlist renamed');
		},
		onError: error => toast(humanError(error, 'Could not rename the playlist'))
	});

	const remove = useMutation({
		mutationFn: () => playlistsApi.remove(id ?? ''),
		onSuccess: () => {
			invalidate();
			toast('Playlist deleted');
			if (router.canGoBack()) router.back();
			else router.replace('/(tabs)/library');
		},
		onError: error => toast(humanError(error, 'Could not delete the playlist'))
	});

	const confirmDelete = (): void => {
		setOptionsOpen(false);
		Alert.alert(
			'Delete this playlist?',
			'The playlist is removed. The tracks stay in your library.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{ text: 'Delete', style: 'destructive', onPress: () => remove.mutate() }
			]
		);
	};

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
						<BackBar
							title='Playlist'
							action={
								playlist ? (
									<IconButton label='Playlist options' onPress={() => setOptionsOpen(true)}>
										<DotsThreeIcon size={24} color={colour.text} weight='bold' />
									</IconButton>
								) : undefined
							}
						/>

						{query.isLoading ? (
							<View style={{ gap: spacing.md, alignItems: 'center' }}>
								<Skeleton height={172} width={172} />
								<Skeleton height={28} width='70%' />
								<Skeleton height={16} width='40%' />
							</View>
						) : null}

						{query.error ? (
							<ErrorState message={humanError(query.error)} onRetry={() => void query.refetch()} />
						) : null}

						{playlist && !query.error ? (
							<>
								<Hero
									artworkUri={artwork}
									title={playlist.title}
									subtitle={playlist.description || undefined}
									meta={[
										formatTrackCount(tracks.length),
										totalDuration > 0 ? formatTotalDuration(totalDuration) : undefined
									]
										.filter(Boolean)
										.join(' · ')}
								/>
								<View style={{ flexDirection: 'row', gap: spacing.sm }}>
									<View style={{ flex: 1 }}>
										<Button
											label='Play'
											disabled={tracks.length === 0}
											onPress={() => {
												const first = tracks[0];
												if (first) playTrack(first, tracks, playlist.title);
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
											if (first) playTrack(first, list, `${playlist.title}, shuffled`);
										}}
									/>
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
						onPress={() => playTrack(item, tracks, playlist?.title ?? 'Playlist')}
						onMenu={() => openTrackMenu(item, id)}
					/>
				)}
				ListEmptyComponent={
					playlist && !query.isLoading && !query.error ? (
						<EmptyState
							title='This playlist is empty'
							message='Open any track’s menu and choose “Add to playlist” — this one is first in the list.'
						/>
					) : null
				}
			/>

			<Sheet visible={optionsOpen} onClose={() => setOptionsOpen(false)} title={playlist?.title}>
				<ListRow
					title='Rename'
					onPress={() => {
						setTitle(playlist?.title ?? '');
						setOptionsOpen(false);
						setRenaming(true);
					}}
				/>
				<ListRow title='Delete playlist' onPress={confirmDelete} />
			</Sheet>

			<Sheet visible={renaming} onClose={() => setRenaming(false)} title='Rename playlist'>
				<View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
					<Field
						value={title}
						onChangeText={setTitle}
						placeholder='Playlist name'
						autoFocus
						maxLength={80}
						onSubmitEditing={() => {
							if (title.trim()) rename.mutate(title.trim());
						}}
					/>
					<Button
						label='Save'
						disabled={!title.trim()}
						loading={rename.isPending}
						onPress={() => rename.mutate(title.trim())}
					/>
					<Text variant='caption' muted>
						The playlist keeps its tracks; only the name changes.
					</Text>
				</View>
			</Sheet>
		</SafeAreaView>
	);
}
