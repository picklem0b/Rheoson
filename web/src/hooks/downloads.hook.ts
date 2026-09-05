import { useEffect, useCallback, useRef } from 'react'
import {
  useDownloadStore,
  selectActiveJobs,
  selectCompletedJobs,
} from '@/store/download.store'
import { downloadsApi } from '@/api/downloads.api'
import { ws } from '@/lib/websocket.lib'
import type { DownloadJob, DownloadOptions } from '@/types/download.types'
import type { Track } from '@/types/track.types'
import { uid } from '@/lib/utils'
import { DOWNLOAD_DEFAULTS } from '@/lib/constants'

// ── Notification sound ────────────────────────────────────────
// Singleton audio element — created once at module level so there's
// no latency when the first download completes.

const _notifAudio = typeof window !== 'undefined'
  ? Object.assign(new Audio('/assets/rhea.mp3'), { volume: 0.6, preload: 'auto' as const })
  : null

function playDoneSound() {
  if (!_notifAudio) return
  _notifAudio.currentTime = 0
  _notifAudio.play().catch(() => {}) // autoplay policy may block; that's fine
}

// ── Hook ──────────────────────────────────────────────────────

export function useDownloads() {
  const jobs        = useDownloadStore((s) => s.jobs)
  const activeJobs  = useDownloadStore(selectActiveJobs)
  const completedJobs = useDownloadStore(selectCompletedJobs)
  const { addJob, updateJob, removeJob, clearDone } = useDownloadStore()

  // Track previous statuses so we can detect done transitions locally
  // (fallback for when the WebSocket isn't connected).
  const prevStatuses = useRef<Map<string, string>>(new Map())

  // ── WebSocket progress ────────────────────────────────────
  // WS is the primary path. The local fallback below handles the case
  // where the WS connection dropped mid-download.

  useEffect(() => {
    ws.connect()

    const onProgress = (data: unknown) => {
      const d = data as Partial<DownloadJob>
      if (!d.id) return
      updateJob(d.id, d)
      // Don't play sound here — wait for the explicit 'done' event
    }

    const onDone = (data: unknown) => {
      const d = data as Partial<DownloadJob>
      if (!d.id) return
      updateJob(d.id, { ...d, status: 'done', progress: 100 })
      // Mark as handled so the local watcher below doesn't double-fire
      prevStatuses.current.set(d.id, 'done')
      playDoneSound()
    }

    const onError = (data: unknown) => {
      const d = data as Partial<DownloadJob>
      if (!d.id) return
      updateJob(d.id, { ...d, status: 'error' })
      prevStatuses.current.set(d.id, 'error')
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

  // ── Local transition watcher (WS fallback) ────────────────
  // Only fires if the WS handler didn't already set prevStatuses to 'done'.

  useEffect(() => {
    for (const job of jobs) {
      const prev = prevStatuses.current.get(job.id)
      // Transition to done that the WS handler didn't already handle
      if (prev !== undefined && prev !== 'done' && job.status === 'done') {
        playDoneSound()
      }
      prevStatuses.current.set(job.id, job.status)
    }
  }, [jobs])

  // ── Actions ───────────────────────────────────────────────

  const download = useCallback(async (
    track: Track,
    options: DownloadOptions = DOWNLOAD_DEFAULTS,
  ) => {
    const tempId = uid('dl')

    // Optimistic job shown immediately in the UI
    addJob({
      id:         tempId,
      trackId:    track.id,
      title:      track.title,
      artist:     track.artist?.name ?? 'Unknown Artist',
      artworkUrl: track.artworkUrl,
      status:     'queued',
      progress:   0,
      format:     options.format,
      quality:    options.quality,
      error:      '',
      filePath:   '',
      createdAt:  new Date().toISOString(),
    })

    try {
      const job = await downloadsApi.startDownload({ trackId: track.id, ...options })
      // Replace temp ID with the real job from the server
      updateJob(tempId, job)
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
    // Optimistically reset to queued while the retry request is in-flight
    updateJob(id, { status: 'queued', progress: 0, error: undefined })
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
    activeJobs,
    completedJobs,
    download,
    cancel,
    retry,
    clearDone,
  }
}
