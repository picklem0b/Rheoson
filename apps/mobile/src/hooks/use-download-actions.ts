import { useMutation, useQueryClient } from '@tanstack/react-query';
import NetInfo, { NetInfoStateType } from '@react-native-community/netinfo';

import { downloadsApi, type DownloadJob } from '@/api/downloads.api';
import { humanError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { qk } from '@/lib/queryKeys';
import { toast } from '@/store/toast.store';
import { useSettingsStore } from '@/store/settings.store';
import type { Track } from '@rheoson/api-types';

/**
 * Everything that can be done to a download job, with the two rules that make
 * the screen trustworthy:
 *
 *  * **Wi-Fi only means Wi-Fi only.** The check runs before the job is created,
 *    not after, so the setting cannot be bypassed by a UI path that forgot it.
 *    The server does the transfer, but the request is still this phone's data.
 *  * **Every failure is said out loud.** A download that silently does nothing
 *    is indistinguishable from a broken button.
 */
export function useDownloadActions() {
	const client = useQueryClient();
	const wifiOnly = useSettingsStore(state => state.wifiOnlyDownloads);

	const refresh = (): void => {
		void client.invalidateQueries({ queryKey: qk.downloads() });
	};

	const ensureAllowed = async (): Promise<void> => {
		if (!wifiOnly) return;
		const net = await NetInfo.fetch();
		if (net.type === NetInfoStateType.cellular) {
			throw new Error('Downloads are set to Wi-Fi only. Turn that off in Settings, or join Wi-Fi.');
		}
	};

	const create = useMutation({
		mutationFn: async (track: Track): Promise<DownloadJob> => {
			await ensureAllowed();
			return downloadsApi.create({
				trackId: track.id,
				title: track.title,
				artist: track.artist?.name,
				album: track.album?.title
			});
		},
		onSuccess: () => {
			void haptic('success');
			toast('Download queued');
			refresh();
		},
		onError: error => toast(humanError(error, 'Could not start the download'))
	});

	const createFromUrl = useMutation({
		mutationFn: async (url: string): Promise<DownloadJob> => {
			await ensureAllowed();
			return downloadsApi.create({ url });
		},
		onSuccess: () => {
			void haptic('success');
			toast('Download queued');
			refresh();
		},
		onError: error => toast(humanError(error, 'Could not start the download'))
	});

	const createBatch = useMutation({
		mutationFn: async (trackIds: string[]) => {
			await ensureAllowed();
			return downloadsApi.createBatch(trackIds);
		},
		onSuccess: result => {
			void haptic('success');
			toast(`${result.jobs.length} downloads queued`);
			refresh();
		},
		onError: error => toast(humanError(error, 'Could not start the downloads'))
	});

	const cancel = useMutation({
		mutationFn: (id: string) => downloadsApi.cancel(id),
		onSuccess: () => {
			toast('Download cancelled');
			refresh();
		},
		onError: error => toast(humanError(error, 'Could not cancel'))
	});

	const retry = useMutation({
		mutationFn: ({ id, resume }: { id: string; resume?: boolean }) => downloadsApi.retry(id, resume),
		onSuccess: () => {
			toast('Download restarted');
			refresh();
		},
		onError: error => toast(humanError(error, 'Could not retry'))
	});

	const remove = useMutation({
		mutationFn: (id: string) => downloadsApi.remove(id),
		onSuccess: () => {
			toast('Removed');
			refresh();
		},
		onError: error => toast(humanError(error, 'Could not remove'))
	});

	return {
		start: (track: Track) => create.mutate(track),
		startFromUrl: (url: string) => createFromUrl.mutateAsync(url).catch(() => undefined),
		startBatch: (trackIds: string[]) => createBatch.mutate(trackIds),
		cancel: (id: string) => cancel.mutate(id),
		retry: (id: string, resume?: boolean) => retry.mutate({ id, resume }),
		remove: (id: string) => remove.mutate(id),
		starting: create.isPending
	};
}
