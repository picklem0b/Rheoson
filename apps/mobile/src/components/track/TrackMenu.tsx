import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	ArrowLeftIcon,
	CheckCircleIcon,
	DownloadSimpleIcon,
	HeartIcon,
	ListPlusIcon,
	PlayCircleIcon,
	PlusIcon,
	ShareNetworkIcon,
	TrashIcon
} from 'phosphor-react-native';

import { playlistsApi } from '@/api/playlists.api';
import { Artwork, Button, Field, IconButton, ListRow, Sheet, Text } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { useDownloadActions } from '@/hooks/use-download-actions';
import { useLikeButton } from '@/hooks/use-liked';
import { useTheme } from '@/hooks/use-theme';
import { humanError } from '@/lib/errors';
import { formatFileSize } from '@/lib/formatters';
import { haptic } from '@/lib/haptics';
import { qk } from '@/lib/queryKeys';
import { shareTrack } from '@/lib/share';
import { useOfflineStore } from '@/store/offline.store';
import { useSheetStore, type TrackMenuTarget } from '@/store/sheet.store';
import { useQueueStore } from '@/store/queue.store';
import { toast } from '@/store/toast.store';

/**
 * The long-press menu, mounted once for the whole app.
 *
 * It is one sheet with three steps — actions, choose a playlist, name a new one
 * — rather than three sheets, because opening a second modal from the first is
 * the point where Android starts dropping touches and iOS starts stacking
 * back-navigation. `step` is local state, and the menu resets to the first step
 * whenever it closes.
 *
 * What is *not* here matters too: every action that changes something says so
 * with a toast. A menu that closes silently after "Add to queue" leaves the
 * user wondering whether the tap registered.
 */
export function TrackMenu(): ReactElement {
	const target = useSheetStore(state => state.trackMenu);
	const close = useSheetStore(state => state.closeTrackMenu);

	return (
		<Sheet visible={Boolean(target)} onClose={close} scroll>
			{target ? <MenuBody key={target.track.id} target={target} close={close} /> : null}
		</Sheet>
	);
}

function MenuBody({ target, close }: { target: TrackMenuTarget; close: () => void }): ReactElement {
	const { track, playlistId } = target;
	const { colour } = useTheme();
	const router = useRouter();
	const client = useQueryClient();
	const { isLiked, onPress: toggleLike } = useLikeButton(track.id);
	const download = useDownloadActions();

	const addToQueue = useQueueStore(state => state.addToQueue);
	const playNext = useQueueStore(state => state.playNext);

	const savedBytes = useOfflineStore(state => state.saved[track.id]);
	const saveProgress = useOfflineStore(state => state.progress[track.id]);
	const keepOnDevice = useOfflineStore(state => state.save);
	const removeFromDevice = useOfflineStore(state => state.remove);

	const [step, setStep] = useState<'menu' | 'playlists' | 'new'>('menu');
	const [title, setTitle] = useState('');

	useEffect(() => {
		setStep('menu');
		setTitle('');
	}, [track.id]);

	const playlists = useQuery({
		queryKey: qk.playlists(),
		queryFn: () => playlistsApi.list(),
		enabled: step === 'playlists'
	});

	const addToPlaylist = useMutation({
		mutationFn: (id: string) => playlistsApi.addTrack(id, track.id),
		onSuccess: () => {
			void client.invalidateQueries({ queryKey: qk.playlistAll() });
			void client.invalidateQueries({ queryKey: qk.playlists() });
			toast('Added to playlist');
			close();
		},
		onError: error => toast(humanError(error, 'Could not add to that playlist'))
	});

	const createPlaylist = useMutation({
		mutationFn: async (name: string) => {
			const playlist = await playlistsApi.create(name);
			await playlistsApi.addTrack(playlist.id, track.id);
			return playlist;
		},
		onSuccess: playlist => {
			void client.invalidateQueries({ queryKey: qk.playlistAll() });
			void client.invalidateQueries({ queryKey: qk.playlists() });
			toast(`Added to “${playlist.title}”`);
			close();
		},
		onError: error => toast(humanError(error, 'Could not create the playlist'))
	});

	const removeFromPlaylist = useMutation({
		mutationFn: (id: string) => playlistsApi.removeTrack(id, track.id),
		onSuccess: () => {
			void client.invalidateQueries({ queryKey: qk.playlistAll() });
			void client.invalidateQueries({ queryKey: qk.playlists() });
			toast('Removed from playlist');
			close();
		},
		onError: error => toast(humanError(error, 'Could not remove the track'))
	});

	const albumId = track.album?.id;
	const artistId = track.artist?.id;
	const canOpenAlbum = Boolean(albumId && albumId !== 'unknown');
	const canOpenArtist = Boolean(artistId && artistId !== 'unknown' && artistId !== 'local');

	const icon = (node: ReactElement): ReactElement => (
		<View
			style={{
				width: 40,
				height: 40,
				borderRadius: radius.md,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: colour.surfaceRaised
			}}
		>
			{node}
		</View>
	);

	const back = (
		<IconButton label='Back' onPress={() => setStep('menu')}>
			<ArrowLeftIcon size={20} color={colour.text} />
		</IconButton>
	);

	if (step === 'playlists') {
		return (
			<>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
					{back}
					<Text variant='heading'>Add to playlist</Text>
				</View>
				<ListRow
					title='New playlist'
					onPress={() => setStep('new')}
					leading={icon(<PlusIcon size={18} color={colour.text} />)}
				/>
				{playlists.isLoading ? (
					<Text variant='caption' muted style={{ paddingVertical: spacing.md }}>
						Loading playlists…
					</Text>
				) : null}
				{playlists.error ? (
					<Text variant='caption' muted style={{ paddingVertical: spacing.md }}>
						{humanError(playlists.error)}
					</Text>
				) : null}
				{playlists.data?.length === 0 ? (
					<Text variant='caption' muted style={{ paddingVertical: spacing.md }}>
						No playlists yet — create one and this track lands in it.
					</Text>
				) : null}
				{playlists.data?.map(playlist => (
					<ListRow
						key={playlist.id}
						title={playlist.title}
						subtitle={`${playlist.trackCount} ${playlist.trackCount === 1 ? 'track' : 'tracks'}`}
						disabled={addToPlaylist.isPending}
						onPress={() => addToPlaylist.mutate(playlist.id)}
						leading={<Artwork uri={playlist.artworkUrl} size={40} />}
						trailing={<CheckCircleIcon size={20} color={colour.textMuted} />}
					/>
				))}
			</>
		);
	}

	if (step === 'new') {
		return (
			<>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
					{back}
					<Text variant='heading'>New playlist</Text>
				</View>
				<View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
					<Field
						value={title}
						onChangeText={setTitle}
						placeholder='Playlist name'
						autoFocus
						maxLength={80}
						onSubmitEditing={() => {
							if (title.trim()) createPlaylist.mutate(title.trim());
						}}
					/>
					<Button
						label='Create and add'
						disabled={!title.trim()}
						loading={createPlaylist.isPending}
						onPress={() => createPlaylist.mutate(title.trim())}
					/>
				</View>
			</>
		);
	}

	return (
		<>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
				<Artwork uri={track.artworkUrl} size={48} />
				<View style={{ flex: 1 }}>
					<Text variant='bodyStrong' numberOfLines={1}>
						{track.title}
					</Text>
					<Text variant='caption' muted numberOfLines={1}>
						{track.artist?.name ?? 'Unknown artist'}
					</Text>
				</View>
			</View>

			<ListRow
				title='Play next'
				onPress={() => {
					const added = playNext(track);
					close();
					toast(added ? 'Playing next' : 'Already in the queue');
				}}
				leading={icon(<PlayCircleIcon size={20} color={colour.text} />)}
			/>
			<ListRow
				title='Add to queue'
				onPress={() => {
					const added = addToQueue(track);
					close();
					toast(added ? 'Added to queue' : 'Already in the queue');
				}}
				leading={icon(<ListPlusIcon size={20} color={colour.text} />)}
			/>
			<ListRow
				title={isLiked ? 'Remove from favourites' : 'Add to favourites'}
				onPress={() => {
					toggleLike();
					close();
				}}
				leading={icon(
					<HeartIcon
						size={20}
						color={isLiked ? colour.accent : colour.text}
						weight={isLiked ? 'fill' : 'regular'}
					/>
				)}
			/>
			<ListRow
				title='Add to playlist'
				onPress={() => setStep('playlists')}
				leading={icon(<PlusIcon size={20} color={colour.text} />)}
			/>
			<ListRow
				title={savedBytes !== undefined ? 'Remove from this device' : 'Keep on this device'}
				subtitle={
					savedBytes !== undefined
						? `Saved · ${formatFileSize(savedBytes)} — plays without a connection`
						: saveProgress !== undefined
							? `Saving… ${Math.round(saveProgress * 100)}%`
							: 'Play it with no connection'
				}
				onPress={() => {
					close();
					if (savedBytes !== undefined) void removeFromDevice(track.id);
					else void keepOnDevice(track);
				}}
				leading={icon(
					<DownloadSimpleIcon
						size={20}
						color={savedBytes !== undefined ? colour.accent : colour.text}
					/>
				)}
			/>
			<ListRow
				title='Download to the server'
				subtitle='Adds it to your library, playable on every device'
				onPress={() => {
					void haptic('light');
					download.start(track);
					close();
				}}
				leading={icon(<DownloadSimpleIcon size={20} color={colour.text} />)}
			/>
			{playlistId ? (
				<ListRow
					title='Remove from this playlist'
					onPress={() => removeFromPlaylist.mutate(playlistId)}
					leading={icon(<TrashIcon size={20} color={colour.danger} />)}
				/>
			) : null}
			{canOpenAlbum ? (
				<ListRow
					title='Go to album'
					onPress={() => {
						close();
						router.push({
							pathname: '/album/[id]',
							params: { id: albumId ?? '', name: track.album?.title ?? '' }
						});
					}}
					leading={icon(<CheckCircleIcon size={20} color={colour.textMuted} />)}
				/>
			) : null}
			{canOpenArtist ? (
				<ListRow
					title='Go to artist'
					onPress={() => {
						close();
						router.push({
							pathname: '/artist/[id]',
							params: { id: artistId ?? '', name: track.artist?.name ?? '' }
						});
					}}
					leading={icon(<CheckCircleIcon size={20} color={colour.textMuted} />)}
				/>
			) : null}
			<ListRow
				title='Share'
				onPress={() => {
					close();
					void shareTrack(track);
				}}
				leading={icon(<ShareNetworkIcon size={20} color={colour.text} />)}
			/>
		</>
	);
}
