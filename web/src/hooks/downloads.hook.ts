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
import { playChime, downloadChimeEnabled } from '@/lib/sounds'
import type { FileNaming } from '@/types'

// Notification chime — louder than the generic success toast so it's
// noticeable, gated by Settings → Notifications → "Sound effects" and
// "Download complete".

// ── Advanced options from Settings → Downloads ────────────────
// Every download (modal, playlist, URL) is sent with the user's saved
// preferences; explicit per-download choices override the stored defaults.

function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`rheoson-${key}`)
    return raw !== null ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const VALID_NAMING: FileNaming[] = ['artist-title', 'title-artist', 'id']

function isCellular(): boolean {
  const conn = (navigator as { connection?: { type?: string } }).connection
  return conn?.type === 'cellular'
}

function persistedOptions() {
  const autoRetry = readPref('dl-auto-retry', true)
  const retries = readPref('dl-retries', 3)
  const naming = readPref<FileNaming>('dl-naming', 'artist-title')
  return {
    embedMetadata: readPref('dl-metadata', true),
    fileNaming: VALID_NAMING.includes(naming) ? naming : 'artist-title',
    customPath: readPref('dl-custom-path', ''),
    // 0 retries when auto-retry is switched off
    retries: autoRetry ? Math.max(0, retries) : 0,
    speedLimit: Math.max(0, readPref('dl-speed-cap', 0)),
    concurrency: Math.min(8, Math.max(1, readPref('dl-concurrent', 3))),
  }
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
      if (downloadChimeEnabled()) playChime(0.6)
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
        if (downloadChimeEnabled()) playChime(0.6)
      }
      prevStatuses.current.set(job.id, job.status)
    }
  }, [jobs])

  // ── Actions ───────────────────────────────────────────────

  const download = useCallback(async (
    track: Track,
    options: DownloadOptions = DOWNLOAD_DEFAULTS,
  ) => {
    // Settings → Downloads → Wi-Fi only: refuse on cellular data
    if (readPref('dl-wifi-only', false) && isCellular()) {
      throw new Error('Wi-Fi only is enabled — connect to Wi-Fi to download')
    }

    const tempId = uid('dl')
    // Persisted advanced options win unless this call overrides them
    const payload: DownloadOptions = {
      ...persistedOptions(),
      ...options,
      format: options.format ?? DOWNLOAD_DEFAULTS.format,
      quality: options.quality ?? DOWNLOAD_DEFAULTS.quality,
      embedArtwork: options.embedArtwork ?? DOWNLOAD_DEFAULTS.embedArtwork,
      embedLyrics: options.embedLyrics ?? DOWNLOAD_DEFAULTS.embedLyrics,
    }

    // Optimistic job shown immediately in the UI
    addJob({
      id:         tempId,
      trackId:    track.id,
      title:      track.title,
      artist:     track.artist?.name ?? 'Unknown Artist',
      artworkUrl: track.artworkUrl,
      status:     'queued',
      progress:   0,
      format:     payload.format,
      quality:    payload.quality,
      error:      '',
      filePath:   '',
      createdAt:  new Date().toISOString(),
    })

    try {
      const job = await downloadsApi.startDownload({ trackId: track.id, ...payload })
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
