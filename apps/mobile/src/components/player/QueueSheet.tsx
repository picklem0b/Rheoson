import type { ReactElement } from 'react';
import { View } from 'react-native';
import { XIcon } from 'phosphor-react-native';

import { Artwork, Button, IconButton, ListRow, Sheet, Text } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/formatters';
import { usePlayerStore } from '@/store/player.store';
import { useQueueStore } from '@/store/queue.store';

/**
 * What is playing and what comes after it.
 *
 * Tapping a queued track jumps to it instead of resetting the queue, which is
 * the difference between "play this now" and "play this album from the top".
 * The sheet is also the only place to remove a single track from the queue
 * without clearing everything, so each row carries its own dismiss button
 * rather than hiding the action behind a long press.
 */
export function QueueSheet({ visible, onClose }: { visible: boolean; onClose: () => void }): ReactElement {
	const { colour } = useTheme();
	const current = usePlayerStore(state => state.currentTrack);
	const isPlaying = usePlayerStore(state => state.isPlaying);
	const queue = useQueueStore(state => state.queue);
	const removeFromQueue = useQueueStore(state => state.removeFromQueue);
	const clearQueue = useQueueStore(state => state.clearQueue);
	const { playFromQueue } = usePlayback();

	return (
		<Sheet
			visible={visible}
			onClose={onClose}
			title={queue.length > 0 ? `Up next · ${queue.length}` : 'Up next'}
			scroll
			footer={
				queue.length > 0 ? (
					<Button label='Clear queue' variant='secondary' onPress={clearQueue} />
				) : null
			}
		>
			{current ? (
				<View style={{ paddingVertical: spacing.sm }}>
					<Text variant='micro' muted>
						NOW PLAYING
					</Text>
					<ListRow
						title={current.title}
						subtitle={isPlaying ? 'Playing' : 'Paused'}
						leading={<Artwork uri={current.artworkUrl} size={40} />}
						trailing={
							current.duration ? (
								<Text variant='caption' muted>
									{formatDuration(current.duration)}
								</Text>
							) : undefined
						}
					/>
				</View>
			) : null}

			{queue.length === 0 ? (
				<Text variant='caption' muted style={{ paddingVertical: spacing.lg }}>
					Nothing queued. Add tracks from their menu, or an album's Play action.
				</Text>
			) : (
				<View style={{ paddingTop: spacing.sm }}>
					<Text variant='micro' muted>
						UP NEXT
					</Text>
					{queue.map((track, index) => (
						<View key={`${track.id}-${index}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
							<View style={{ flex: 1 }}>
								<ListRow
									title={track.title}
									subtitle={track.artist?.name ?? 'Unknown artist'}
									onPress={() => {
										playFromQueue(index);
										onClose();
									}}
									leading={<Artwork uri={track.artworkUrl} size={40} />}
								/>
							</View>
							<IconButton label={`Remove ${track.title} from the queue`} onPress={() => removeFromQueue(index)}>
								<XIcon size={18} color={colour.textMuted} />
							</IconButton>
						</View>
					))}
				</View>
			)}
		</Sheet>
	);
}
