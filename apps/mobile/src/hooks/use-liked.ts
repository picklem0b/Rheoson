import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { tracksApi } from '@/api/tracks.api';
import { qk } from '@/lib/queryKeys';
import { haptic } from '@/lib/haptics';

/**
 * Likes, for every surface that shows a heart.
 *
 * The mutation invalidates more than the liked list on purpose: a track row
 * embeds `isLiked`, so the library, history and shelves all carry stale copies
 * the moment one like changes. Refreshing the whole set is what stops the same
 * heart appearing filled in one place and empty in another.
 */
export function useLikedIds() {
	const query = useQuery({
		queryKey: qk.likedIds(),
		queryFn: () => tracksApi.likedIds(),
		staleTime: 60_000
	});
	return new Set(query.data ?? []);
}

export function useToggleLike() {
	const client = useQueryClient();

	return useMutation({
		mutationFn: async ({ trackId, liked }: { trackId: string; liked: boolean }) => {
			if (liked) await tracksApi.unlike(trackId);
			else await tracksApi.like(trackId);
			return { trackId, liked: !liked };
		},
		onSuccess: () => {
			void haptic('light');
			void client.invalidateQueries({ queryKey: qk.likedTracks() });
			void client.invalidateQueries({ queryKey: qk.likedIds() });
			void client.invalidateQueries({ queryKey: qk.likedCount() });
			void client.invalidateQueries({ queryKey: qk.libraryTracks() });
			void client.invalidateQueries({ queryKey: qk.recentlyPlayed() });
			void client.invalidateQueries({ queryKey: qk.recentlyPlayedFull() });
			void client.invalidateQueries({ queryKey: qk.home() });
		}
	});
}

/** Convenience for a row: the id, whether it is liked, and a toggle. */
export function useLikeButton(trackId: string) {
	const liked = useLikedIds();
	const toggle = useToggleLike();
	const isLiked = liked.has(trackId);
	const onPress = useCallback(() => {
		toggle.mutate({ trackId, liked: isLiked });
	}, [toggle, trackId, isLiked]);
	return { isLiked, onPress, pending: toggle.isPending };
}
