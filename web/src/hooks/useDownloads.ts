import { useEffect, useCallback } from 'react'
import { useDownloadStore } from '@/store/downloadStore'
import { downloadsApi } from '@/api/downloads'
import { ws } from '@/lib/websocket'
import type { DownloadJob, DownloadOptions } from '@/types/download'
import type { Track } from '@/types/track'
import { uid } from '@/lib/utils'
import { DOWNLOAD_DEFAULTS } from '@/lib/constants'

export function useDownloads() {
  const { jobs, addJob, updateJob, removeJob, clearDone, activeJobs, completedJobs } = useDownloadStore()

  // WebSocket progress updates
  useEffect(() => {
    ws.connect()

    const onProgress = (data: unknown) => {
      const d = data as Partial<DownloadJob>
      if (d.id) updateJob(d.id, d)
    }

    ws.on('download:progress', onProgress)
    ws.on('download:done',     onProgress)
    ws.on('download:error',    onProgress)

    return () => {
      ws.off('download:progress', onProgress)
      ws.off('download:done',     onProgress)
      ws.off('download:error',    onProgress)
    }
  }, [updateJob])

  const download = useCallback(async (
    track: Track,
    options: DownloadOptions = DOWNLOAD_DEFAULTS
  ) => {
    const tempId = uid('dl')

    const optimistic: DownloadJob = {
      id:         tempId,
      trackId:    track.id,
      title:      track.title,
      artist:     track.artist.name,
      artworkUrl: track.artworkUrl,
      status:     'queued',
      progress:   0,
      format:     options.format,
      quality:    options.quality,
      createdAt:  new Date().toISOString(),
    }

    addJob(optimistic)

    try {
      const job = await downloadsApi.startDownload({ trackId: track.id, ...options })
      updateJob(tempId, { ...job })
    } catch (e) {
      updateJob(tempId, { status: 'error', error: e instanceof Error ? e.message : 'Failed' })
    }
  }, [addJob, updateJob])

  const cancel = useCallback(async (id: string) => {
    await downloadsApi.cancelDownload(id).catch(() => {})
    removeJob(id)
  }, [removeJob])

  const retry = useCallback(async (id: string) => {
    try {
      const job = await downloadsApi.retryDownload(id)
      updateJob(id, job)
    } catch (e) {
      updateJob(id, { status: 'error', error: e instanceof Error ? e.message : 'Failed' })
    }
  }, [updateJob])

  return {
    jobs,
    activeJobs:    activeJobs(),
    completedJobs: completedJobs(),
    download,
    cancel,
    retry,
    clearDone,
  }
}