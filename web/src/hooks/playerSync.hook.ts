import { useEffect, useRef } from 'react'
import { usePlayerStore } from '@/store/player.store'
import { useQueueStore } from '@/store/queue.store'
import { useWebSocket } from '@/lib/websocket.lib'
import { usePlayer } from '@/hooks/player.hook'
import { tracksApi } from '@/api/tracks.api'
import type { Track } from '@/types/track.types'

/**
 * Cross-device playback sync.
 *
 * Each tab gets a unique session id. Local playback changes are emitted
 * as `player:state` (throttled); the server relays them to the account's
 * other devices. Remote messages from a DIFFERENT session are applied —
 * the newest `updatedAt` wins, which stops two devices fighting.
 *
 * Applied: current track (fetched + loaded), play/pause, and position
 * (seek when the remote device is paused, or right after a track change).
 * Queue ids ride along so a freshly-switched device can adopt the queue.
 */

const SESSION_ID = Math.random().toString(36).slice(2)
const EMIT_THROTTLE_MS = 1_500
const PROGRESS_TOLERANCE_S = 4

interface PlayerStateMsg {
   sessionId: string
   updatedAt: number
   currentTrack: { id: string; title: string; artist?: string } | null
   isPlaying: boolean
   progress: number
   duration: number
   queueIds: string[]
   historyIds: string[]
}

function buildState(): PlayerStateMsg {
   const p = usePlayerStore.getState()
   const q = useQueueStore.getState()
   return {
      sessionId: SESSION_ID,
      updatedAt: Date.now(),
      currentTrack: p.currentTrack
         ? {
              id: p.currentTrack.id,
              title: p.currentTrack.title ?? '',
              artist: p.currentTrack.artist?.name,
           }
         : null,
      isPlaying: p.isPlaying,
      progress: Math.round(p.progress),
      duration: p.duration,
      queueIds: q.queue.map((t) => t.id).slice(0, 60),
      historyIds: q.history.map((t) => t.id).slice(-30),
   }
}

export function usePlayerSync() {
   const { on, off, emit } = useWebSocket()
   const { play, pause, seek } = usePlayer()
   const lastApplied = useRef(0)

   // ── Emit local state (throttled) ───────────────────────────
   useEffect(() => {
      const send = () => emit('player:state', buildState())

      let lastSent = 0
      let progressTimer: number | null = null

      const maybeSend = (immediate = false) => {
         const now = Date.now()
         if (immediate || now - lastSent >= EMIT_THROTTLE_MS) {
            lastSent = now
            send()
         } else if (progressTimer === null) {
            // Flush once after the throttle window if something changed
            progressTimer = window.setTimeout(() => {
               progressTimer = null
               lastSent = Date.now()
               send()
            }, EMIT_THROTTLE_MS - (now - lastSent))
         }
      }

      let lastTrack = usePlayerStore.getState().currentTrack?.id
      let lastPlaying = usePlayerStore.getState().isPlaying

      const unsubPlayer = usePlayerStore.subscribe((s) => {
         const trackChanged = s.currentTrack?.id !== lastTrack
         const playingChanged = s.isPlaying !== lastPlaying
         lastTrack = s.currentTrack?.id
         lastPlaying = s.isPlaying
         if (trackChanged || playingChanged) {
            maybeSend(true)
         } else {
            maybeSend(false)
         }
      })

      const unsubQueue = useQueueStore.subscribe((s) => {
         // Only propagate queue shape changes (add/remove/clear), not per-tick
         maybeSend(false)
      })

      return () => {
         unsubPlayer()
         unsubQueue()
         if (progressTimer !== null) window.clearTimeout(progressTimer)
      }
   }, [emit])

   // ── Apply remote state ─────────────────────────────────────
   useEffect(() => {
      let cancelled = false
      let seekTimer: number | null = null

      const seekWhenLoaded = (progress: number, timeoutMs = 10_000) => {
         const start = Date.now()
         const trySeek = () => {
            if (cancelled) return
            const dur = usePlayerStore.getState().duration
            if (dur > 0 || Date.now() - start > timeoutMs) {
               seek(progress)
            } else {
               seekTimer = window.setTimeout(trySeek, 150)
            }
         }
         trySeek()
      }

      const applyQueue = async (queueIds: string[], historyIds: string[]) => {
         const all = [...historyIds, ...queueIds].filter(Boolean)
         if (!all.length) return
         const hydrated: Track[] = []
         // Best-effort, capped; IndexedDB cache makes repeats cheap
         const batch = all.slice(0, 60)
         const results = await Promise.all(
            batch.map((id) => tracksApi.getTrack(id).catch(() => null))
         )
         results.forEach((t) => { if (t) hydrated.push(t) })
         if (cancelled || !hydrated.length) return
         const q = useQueueStore.getState()
         // Only adopt when the incoming queue is meaningfully different
         const incomingIds = [...historyIds, ...queueIds]
         const currentIds = [...q.history, ...q.queue].map((t) => t.id)
         if (incomingIds.join('|') !== currentIds.join('|')) {
            // current track = last history item of the sender
            const idx = Math.max(0, historyIds.length - 1)
            const localIdx = hydrated.findIndex((t) => t.id === historyIds[historyIds.length - 1])
            if (localIdx >= 0) {
               useQueueStore.getState().setQueue(hydrated, localIdx)
            } else {
               useQueueStore.getState().setQueue(hydrated, Math.min(idx, hydrated.length - 1))
            }
         }
      }

      const handler = (msg: PlayerStateMsg) => {
         if (!msg || typeof msg !== 'object') return
         if (msg.sessionId === SESSION_ID) return  // our own echo
         if (typeof msg.updatedAt !== 'number' || msg.updatedAt <= lastApplied.current) return
         lastApplied.current = msg.updatedAt

         const st = usePlayerStore.getState()

         if (!msg.currentTrack) {
            if (st.isPlaying) pause()
            return
         }

         if (st.currentTrack?.id !== msg.currentTrack.id) {
            // Adopt the remote track + queue
            applyQueue(msg.queueIds, msg.historyIds)
            tracksApi
               .getTrack(msg.currentTrack.id)
               .then((track) => {
                  if (cancelled) return
                  const cur = usePlayerStore.getState().currentTrack?.id
                  if (cur === msg.currentTrack?.id) return  // already switched
                  usePlayerStore.getState().setTrack(track)
                  seekWhenLoaded(msg.progress)
               })
               .catch(() => {})
            return
         }

         // Same track — sync play state and position
         if (msg.isPlaying && !st.isPlaying) play()
         if (!msg.isPlaying && st.isPlaying) pause()
         if (!msg.isPlaying && Math.abs(st.progress - msg.progress) > PROGRESS_TOLERANCE_S) {
            seek(msg.progress)
         }
      }

      on('player:state', handler)
      return () => {
         cancelled = true
         off('player:state', handler)
         if (seekTimer !== null) window.clearTimeout(seekTimer)
      }
   }, [on, off, play, pause, seek])
}