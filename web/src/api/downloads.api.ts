import { api } from './client.api'
import type { DownloadJob, DownloadOptions } from '@/types/download.types'

export const downloadsApi = {
  /** Start a download by track ID or arbitrary URL. */
  startDownload: (payload: ({ trackId: string } | { url: string }) & DownloadOptions) =>
    api.post<DownloadJob>('/downloads', payload),

  getDownloads: () =>
    api.get<DownloadJob[]>('/downloads', NO_FATAL),

  getDownload: (id: string) =>
    api.get<DownloadJob>(`/downloads/${id}`, NO_FATAL),

  cancelDownload: (id: string) =>
    api.post<void>(`/downloads/${id}/cancel`),

  retryDownload: (id: string) =>
    api.post<DownloadJob>(`/downloads/${id}/retry`),
  /** retry with explicit resume control — omit for auto (resume when staged data exists). */
  retryDownloadResumed: (id: string, resume: boolean) =>
    api.post<DownloadJob>(`/downloads/${id}/retry`, { resume }),

  deleteDownload: (id: string) =>
    api.delete<void>(`/downloads/${id}`, NO_FATAL),

  /** Start many downloads at once (backend caps at 20 per call). */
  batchDownload: (payload: {
    track_ids: string[]
  } & DownloadOptions) =>
    api.post<DownloadJob[]>('/downloads/batch', payload),
}

const NO_FATAL = { _noFatalRedirect: true } as const
