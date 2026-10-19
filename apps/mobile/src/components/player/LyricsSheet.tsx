import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { lyricsApi, type LyricLine } from '@/api/lyrics.api';
import { Sheet, Text } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { useTheme } from '@/hooks/use-theme';
import { qk } from '@/lib/queryKeys';
import { usePlayerStore } from '@/store/player.store';

/**
 * Lyrics, timed when the provider has timings.
 *
 * The active line is derived from playback position on every render — no timer
 * of its own — which means it stays correct after a seek, a pause or a jump.
 * Tapping a line seeks to it, so the lyric sheet doubles as a chapter list for
 * the song.
 *
 * A track with no lyrics is not an error: the section says so plainly instead
 * of offering a retry for something that will never appear.
 */
export function LyricsSheet({
	visible,
	onClose,
	trackId
}: {
	visible: boolean;
	onClose: () => void;
	trackId: string | null;
}): ReactElement {
	const { colour } = useTheme();
	const { height } = useWindowDimensions();
	const progress = usePlayerStore(state => state.progress);
	const { seek } = usePlayback();
	const listRef = useRef<FlatList<LyricLine>>(null);

	const query = useQuery({
		queryKey: qk.lyrics(trackId ?? 'none'),
		queryFn: () => lyricsApi.forTrack(trackId ?? ''),
		enabled: visible && Boolean(trackId),
		staleTime: 5 * 60_000
	});

	const synced = query.data?.synced ?? null;

	const lines = useMemo<LyricLine[]>(() => {
		if (synced && synced.length > 0) return synced;
		const plain = query.data?.plain;
		if (!plain) return [];
		return plain
			.split('\n')
			.map(text => text.trim())
			.filter(Boolean)
			.map(text => ({ text }));
	}, [query.data?.plain, synced]);

	const activeIndex = useMemo(() => {
		if (!synced || synced.length === 0) return -1;
		let index = -1;
		for (let i = 0; i < synced.length; i += 1) {
			const start = synced[i]?.startTime;
			if (typeof start === 'number' && start <= progress + 0.25) index = i;
			else if (typeof start === 'number' && start > progress + 0.25) break;
		}
		return index;
	}, [synced, progress]);

	useEffect(() => {
		if (!visible || activeIndex < 0) return;
		const timer = setTimeout(() => {
			listRef.current?.scrollToIndex({
				index: Math.max(0, activeIndex),
				animated: true,
				viewPosition: 0.4
			});
		}, 120);
		return () => clearTimeout(timer);
	}, [activeIndex, visible]);

	return (
		<Sheet visible={visible} onClose={onClose} title='Lyrics'>
			<View style={{ height: height * 0.58 }}>
				{query.isLoading ? (
					<Text variant='caption' muted style={{ paddingVertical: spacing.lg }}>
						Looking for lyrics…
					</Text>
				) : lines.length === 0 ? (
					<View style={{ paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.sm }}>
						<Text variant='bodyStrong'>No lyrics for this track</Text>
						<Text variant='caption' muted style={{ textAlign: 'center', maxWidth: 280 }}>
							The provider had nothing for it. Most tracks have them; instrumentals do not.
						</Text>
					</View>
				) : (
					<FlatList
						ref={listRef}
						data={lines}
						keyExtractor={(line, index) => `${index}-${line.startTime ?? 'x'}`}
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{ paddingVertical: spacing.lg, gap: spacing.sm }}
						onScrollToIndexFailed={info => {
							// Variable-height lines have no getItemLayout; falling back
							// to an estimated offset still lands close enough to read.
							listRef.current?.scrollToOffset({
								offset: info.averageItemLength * info.index,
								animated: true
							});
						}}
						renderItem={({ item, index }) => {
							const active = index === activeIndex;
							const seekable = typeof item.startTime === 'number';
							return (
								<Pressable
									disabled={!seekable}
									onPress={() => {
										if (typeof item.startTime === 'number') seek(item.startTime);
									}}
									style={({ pressed }) => ({
										paddingVertical: spacing.xs,
										paddingHorizontal: spacing.sm,
										borderRadius: 10,
										backgroundColor: pressed ? colour.surfacePressed : 'transparent'
									})}
								>
									<Text
										variant={active ? 'heading' : 'body'}
										muted={!active}
										style={{ color: active ? colour.accent : undefined }}
									>
										{item.text}
									</Text>
								</Pressable>
							);
						}}
					/>
				)}
			</View>
		</Sheet>
	);
}
