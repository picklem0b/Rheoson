import { api } from './client'
import type { DownloadJob, DownloadOptions } from '@/types/download'

export const downloadsApi = {
  /** Start a download by track ID or arbitrary URL. */
  startDownload: (payload: ({ trackId: string } | { url: string }) & DownloadOptions) =>
    api.post<DownloadJob>('/downloads', payload),

  getDownloads: () =>
    api.get<DownloadJob[]>('/downloads'),

  getDownload: (id: string) =>
    api.get<DownloadJob>(`/downloads/${id}`),

  cancelDownload: (id: string) =>
    api.post<void>(`/downloads/${id}/cancel`),

  retryDownload: (id: string) =>
    api.post<DownloadJob>(`/downloads/${id}/retry`),

  deleteDownload: (id: string) =>
    api.delete<void>(`/downloads/${id}`),
}
