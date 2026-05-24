import { useEffect, useCallback, useRef } from 'react'
import { useDownloadStore } from '@/store/downloadStore'
import { downloadsApi } from '@/api/downloads'
import { ws } from '@/lib/websocket'
import type { DownloadJob, DownloadOptions } from '@/types/download'
import type { Track } from '@/types/track'
import { uid } from '@/lib/utils'
import { DOWNLOAD_DEFAULTS } from '@/lib/constants'

// ── Notification sound ────────────────────────────────────────
const _audio = typeof window !== 'undefined'
  ? new Audio('/assets/rhea.mp3')
  : null

if (_audio) {
  _audio.volume = 0.6
  _audio.preload = 'auto'
}

function playDoneSound() {
  if (!_audio) return
  _audio.currentTime = 0
  _audio.play().catch(() => {})   // ignore autoplay policy errors
}

// ── Hook ──────────────────────────────────────────────────────
export function useDownloads() {
  const {
    jobs,
    addJob,
    updateJob,
    removeJob,
    clearDone,
    activeJobs,
    completedJobs,
  } = useDownloadStore()

  const prevJobStatuses = useRef<Record<string, string>>({})

  // WebSocket progress updates
  useEffect(() => {
    ws.connect()

    const onProgress = (data: unknown) => {
      const d = data as Partial<DownloadJob>
      if (!d.id) return
      updateJob(d.id, d)
    }

    const onDone = (data: unknown) => {
      const d = data as Partial<DownloadJob>
      if (!d.id) return
      updateJob(d.id, { ...d, status: 'done', progress: 100 })
      playDoneSound()
    }

    const onError = (data: unknown) => {
      const d = data as Partial<DownloadJob>
      if (d.id) updateJob(d.id, { ...d, status: 'error' })
    }

    ws.on('download:progress', onProgress)
    ws.on('download:done',     onDone)
    ws.on('download:error',    onError)

    return () => {
      ws.off('download:progress', onProgress)
      ws.off('download:done',     onDone)
      ws.off('download:error',    onError)
    }
  }, [updateJob])

  // Also watch job status transitions locally for sound
  // (in case WS is not connected)
  useEffect(() => {
    jobs.forEach((job) => {
      const prev = prevJobStatuses.current[job.id]
      if (prev && prev !== 'done' && job.status === 'done') {
        playDoneSound()
      }
      prevJobStatuses.current[job.id] = job.status
    })
  }, [jobs])

  const download = useCallback(async (
    track: Track,
    options: DownloadOptions = DOWNLOAD_DEFAULTS,
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
      const job = await downloadsApi.startDownload({
        trackId: track.id,
        ...options,
      })
      updateJob(tempId, { ...job })
    } catch (e) {
      updateJob(tempId, {
        status: 'error',
        error:  e instanceof Error ? e.message : 'Download failed',
      })
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
      updateJob(id, {
        status: 'error',
        error:  e instanceof Error ? e.message : 'Retry failed',
      })
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