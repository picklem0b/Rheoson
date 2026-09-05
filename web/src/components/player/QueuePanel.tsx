import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ListMusic, Trash2, Plus, Search } from 'lucide-react'
import { useUIStore } from '@/store/ui.store'
import { useQueueStore } from '@/store/queue.store'
import { usePlayerStore } from '@/store/player.store'
import QueueItem from './QueueItem'
import { IconButton } from '@/components/ui/IconButton'
import { ArtworkImage } from '@/components/ui/ArtworkImage'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toaster'
import { useTrackContextMenu } from '@/hooks/useTrackContextMenu'
import { searchApi } from '@/api/search.api'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/formatters'
import type { Track } from '@/types/track.types'

export default function QueuePanel() {
  const showQueue = useUIStore((s) => s.showQueue)
  const toggleQueue = useUIStore((s) => s.toggleQueue)
  const { queue, clearQueue } = useQueueStore()
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const contextMenu = useTrackContextMenu(currentTrack)

  // No track = no panel
  if (!currentTrack) return null

  return (
    <>
      <AnimatePresence>
        {showQueue && (
          <>
            {/* Backdrop */}
            <motion.div
              key="queue-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
              onClick={toggleQueue}
            />

            {/* Panel */}
            <motion.div
              key="queue-panel"
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className={cn(
                'fixed right-0 top-0 bottom-0 z-50 w-80 max-w-[92vw] flex flex-col',
                'glass-strong border-l border-[var(--border)]'
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2.5">
                  <ListMusic className="w-5 h-5 text-[var(--accent)]" />
                  <h2 className="font-bold text-[var(--text-primary)]">Queue</h2>
                  {queue.length > 0 && (
                    <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded-full">
                      {queue.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <AddToQueueButton />
                  {queue.length > 0 && (
                    <IconButton size="sm" variant="ghost" onClick={clearQueue} title="Clear queue">
                      <Trash2 />
                    </IconButton>
                  )}
                  <IconButton size="sm" variant="ghost" onClick={toggleQueue}>
                    <X />
                  </IconButton>
                </div>
              </div>

              <ScrollArea className="flex-1 px-3 py-3">
                {/* Now playing */}
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] px-3 mb-2">
                    Now Playing
                  </p>
                  <div
                    {...contextMenu}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-[var(--accent-subtle)] border border-[var(--accent-border)]"
                  >
                    <ArtworkImage
                      src={currentTrack.artworkUrl}
                      alt={currentTrack.title}
                      size={40}
                      radius="rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--accent)] truncate">
                        {currentTrack.title}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] truncate">
                        {currentTrack.artist?.name ?? 'Unknown Artist'}
                      </p>
                    </div>
                    <div className="flex items-end gap-[2px] ml-auto flex-shrink-0">
                      <span className="eq-bar h-[8px]" />
                      <span className="eq-bar h-[12px]" />
                      <span className="eq-bar h-[6px]" />
                    </div>
                  </div>
                </div>

                {/* Up next */}
                {queue.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] px-3 mb-2">
                      Up Next
                    </p>
                    <AnimatePresence mode="popLayout">
                      {queue.map((track, i) => (
                        <QueueItem key={track.id} track={track} index={i} />
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <ListMusic className="w-10 h-10 text-[var(--text-muted)]" />
                    <p className="text-sm text-[var(--text-muted)]">Queue is empty</p>
                    <p className="text-xs text-[var(--text-muted)] opacity-60">
                      Tap + to add songs
                    </p>
                  </div>
                )}
              </ScrollArea>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

// ── Add-to-queue button + picker ──────────────────────────────

function AddToQueueButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconButton size="sm" variant="ghost" onClick={() => setOpen(true)} title="Add to queue">
        <Plus />
      </IconButton>
      {open && <AddToQueueModal onClose={() => setOpen(false)} />}
    </>
  )
}

function AddToQueueModal({ onClose }: { onClose: () => void }) {
  const addToQueue = useQueueStore((s) => s.addToQueue)
  const queue = useQueueStore((s) => s.queue)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const { toast } = useToast()

  const [query, setQuery] = useState('')
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  // Debounced search
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setTracks([])
      setSearched(false)
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    const t = setTimeout(async () => {
      try {
        const res = await searchApi.search(q)
        if (!alive) return
        setTracks(res.tracks ?? [])
        setSearched(true)
      } catch {
        if (alive) {
          setError("Couldn't search right now")
          setTracks([])
        }
      } finally {
        if (alive) setLoading(false)
      }
    }, 350)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query])

  const isQueued = (id: string) =>
    queue.some((t) => t.id === id) || currentTrack?.id === id

  return (
    <Modal open onClose={onClose} title="Add to queue" className="max-h-[88dvh] overflow-hidden flex flex-col">
      {/* Search field */}
      <div className="relative mb-4 flex-shrink-0">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs to queue…"
          className="w-full h-11 pl-10 pr-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]
                     text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                     outline-none focus:border-[var(--accent)] transition-colors"
        />
      </div>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 pb-2">
        {loading && (
          <p className="text-center text-[13px] text-[var(--text-muted)] py-8">Searching…</p>
        )}
        {error && (
          <p className="text-center text-[13px] text-red-400 py-8">{error}</p>
        )}
        {!loading && query.trim().length >= 2 && searched && tracks.length === 0 && (
          <p className="text-center text-[13px] text-[var(--text-muted)] py-8">
            No tracks found for “{query.trim()}”
          </p>
        )}
        {!loading && query.trim().length < 2 && (
          <p className="text-center text-[13px] text-[var(--text-muted)] py-8">
            Type at least 2 characters to search
          </p>
        )}
        <div className="space-y-0.5">
          {tracks.map((track) => {
            const added = isQueued(track.id)
            return (
              <button
                key={track.id}
                disabled={added}
                onClick={() => {
                  addToQueue(track)
                  toast(`Added to queue — ${track.title}`, 'success')
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-2 py-1.5 rounded-xl text-left transition-colors',
                  added
                    ? 'opacity-45 cursor-default'
                    : 'hover:bg-[var(--bg-elevated)] active:bg-[var(--bg-elevated)]'
                )}
              >
                <ArtworkImage src={track.artworkUrl} alt={track.title} size={40} radius="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {track.title}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] truncate">
                    {track.artist?.name ?? 'Unknown Artist'}
                  </p>
                </div>
                <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">
                  {formatDuration(track.duration)}
                </span>
                {added && (
                  <span className="text-[10px] font-bold text-[var(--accent)] flex-shrink-0">
                    In queue
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
