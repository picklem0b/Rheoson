import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { readOfflineCache, writeOfflineCache } from '@/lib/offlineCache';
import { OFFLINE_SECTIONS } from '@/lib/queryKeys';

/**
 * Keeps the device's mirror of the account's library in step with the cache.
 *
 * Two directions, both cheap:
 *
 *  * **write** — whenever a mirrored query settles, its data is copied into
 *    AsyncStorage. This is what makes the next launch (or a dead zone) show
 *    the liked list instead of an empty screen.
 *  * **read** — on mount, any mirrored query with *nothing* in the cache is
 *    seeded from storage. Never over a real answer: the network always wins,
 *    so a stale mirror cannot resurrect old state over fresh data.
 *
 * The mirror is per account (`user`), and a section that failed to revalidate
 * is left alone rather than overwritten with blank — see offlineCache.
 */
export function useOfflineMirror(user: string | null): void {
	const client = useQueryClient();

	useEffect(() => {
		if (!user) return undefined;

		let cancelled = false;
		void (async () => {
			for (const [key, section] of OFFLINE_SECTIONS) {
				if (cancelled) return;
				if (client.getQueryData(key as unknown[]) !== undefined) continue;
				const envelope = await readOfflineCache(section, user);
				if (!envelope || envelope.data == null || cancelled) continue;
				client.setQueryData(key as unknown[], envelope.data, {
					updatedAt: Date.parse(envelope.updatedAt) || Date.now()
				});
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [client, user]);

	useEffect(() => {
		if (!user) return undefined;
		return mirrorCacheWrites(client, user);
	}, [client, user]);
}

/** Copy every settled mirrored query into storage, debounced into one burst. */
function mirrorCacheWrites(client: QueryClient, user: string): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const unsubscribe = client.getQueryCache().subscribe(() => {
		if (timer) clearTimeout(timer);
		// A single screen load settles several queries at once; writing them
		// one by one would serialise the same file repeatedly.
		timer = setTimeout(() => {
			for (const [key, section] of OFFLINE_SECTIONS) {
				const data = client.getQueryData(key as unknown[]);
				if (data !== undefined) void writeOfflineCache(section, user, data);
			}
		}, 600);
	});

	return () => {
		if (timer) clearTimeout(timer);
		unsubscribe();
	};
}
