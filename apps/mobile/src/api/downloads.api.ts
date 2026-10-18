import { api } from './client';

export type DownloadStatus = 'queued' | 'downloading' | 'converting' | 'done' | 'failed' | 'cancelled';

export interface DownloadJob {
	id: string;
	title: string;
	artist?: string;
	status: DownloadStatus;
	progress?: number;
	speed?: string;
	eta?: string;
	error?: string;
	/** Present when the job can be continued after a failure or restart. */
	resumable?: boolean;
	stagedBytes?: number;
	createdAt?: string;
	owner?: string;
}

export interface DownloadRequest {
	url?: string;
	trackId?: string;
	title?: string;
	artist?: string;
	album?: string;
	quality?: 'best' | 'high' | 'medium';
}

/**
 * Downloads.
 *
 * The work happens on the server (yt-dlp runs there, not here), so this is a
 * job API: create one, watch it, retry it. Progress arrives over the socket;
 * these calls are what a screen does when the socket is not connected — on a
 * cold start, or after the app was killed mid-transfer.
 */
export const downloadsApi = {
	list: async (): Promise<DownloadJob[]> => {
		const raw = await api.get<{ jobs?: DownloadJob[] } | DownloadJob[]>('/downloads');
		if (Array.isArray(raw)) return raw;
		return raw?.jobs ?? [];
	},

	create: (request: DownloadRequest) => api.post<DownloadJob>('/downloads', request),

	createBatch: (trackIds: string[]) => api.post<{ jobs: DownloadJob[] }>('/downloads/batch', { trackIds }),

	cancel: (id: string) => api.post<DownloadJob>(`/downloads/${id}/cancel`),

	retry: (id: string, resume?: boolean) =>
		api.post<DownloadJob>(`/downloads/${id}/retry`, resume === undefined ? {} : { resume }),

	remove: (id: string) => api.delete(`/downloads/${id}`)
};
