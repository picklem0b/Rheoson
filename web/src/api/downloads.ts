import { api } from './client'
import type { DownloadJob, DownloadOptions } from '@/types/download'

export const downloadsApi = {
  // Start a download by track ID or URL
  startDownload: (payload: { trackId?: string; url?: string } & DownloadOptions) =>
    api.post<DownloadJob>('/downloads', payload),

  // Get all download jobs
  getDownloads: () =>
    api.get<DownloadJob[]>('/downloads'),

  // Get single job status
  getDownload: (id: string) =>
    api.get<DownloadJob>(`/downloads/${id}`),

  // Cancel a job
  cancelDownload: (id: string) =>
    api.post<void>(`/downloads/${id}/cancel`),

  // Retry a failed job
  retryDownload: (id: string) =>
    api.post<DownloadJob>(`/downloads/${id}/retry`),

  // Delete a completed job record
  deleteDownload: (id: string) =>
    api.delete<void>(`/downloads/${id}`),
}