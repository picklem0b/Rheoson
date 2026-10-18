import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { downloadsApi, type DownloadJob } from '@/api/downloads.api';
import { qk } from '@/lib/queryKeys';
import { onEvent } from '@/services/socket';

/**
 * Download jobs, live.
 *
 * The REST list is the source of truth on mount — it is what a cold start sees,
 * including jobs started before the app was killed — and the socket then keeps
 * it current while the screen is open. A job that finishes while the app is
 * backgrounded updates on the next focus rather than being missed, because the
 * socket is not the only path that can tell us.
 */
export function useDownloads() {
	const client = useQueryClient();

	const query = useQuery({
		queryKey: qk.downloads(),
		queryFn: () => downloadsApi.list(),
		// Poll while anything is moving; a finished list costs nothing.
		refetchInterval: query => {
			const jobs = (query.state.data ?? []) as DownloadJob[];
			return jobs.some(job => job.status === 'downloading' || job.status === 'queued')
				? 4_000
				: false;
		}
	});

	useEffect(() => {
		let unsubscribe: (() => void) | undefined;
		void onEvent<DownloadJob>('download:progress', job => {
			client.setQueryData<DownloadJob[]>(qk.downloads(), previous => {
				if (!previous) return previous;
				return previous.map(item => (item.id === job.id ? { ...item, ...job } : item));
			});
		}).then(unsub => {
			unsubscribe = unsub;
		});
		return () => unsubscribe?.();
	}, [client]);

	const jobs = query.data ?? [];
	return {
		jobs,
		active: jobs.filter(job => job.status === 'downloading' || job.status === 'queued'),
		finished: jobs.filter(job => job.status === 'done'),
		failed: jobs.filter(job => job.status === 'failed'),
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch
	};
}
