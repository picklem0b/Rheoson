import { motion, AnimatePresence } from 'framer-motion'
import { X, ListMusic, Trash2 } from 'lucide-react'
import { useUIStore } from '@/store/ui.store'
import { useQueueStore } from '@/store/queue.store'
import { usePlayerStore } from '@/store/player.store'
import QueueItem from './QueueItem'
import { IconButton } from '@/components/ui/IconButton'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { cn } from '@/lib/utils'

export default function QueuePanel() {
  const showQueue  = useUIStore((s) => s.showQueue)
  const toggleQueue = useUIStore((s) => s.toggleQueue)
  const { queue, clearQueue } = useQueueStore()
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  // No track = no panel
  if (!currentTrack) return null

  return (
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
            animate={{ x: 0,      opacity: 1 }}
            exit={{    x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={cn(
              'fixed right-0 top-0 bottom-0 z-50 w-80 flex flex-col',
              'glass-strong border-l border-[var(--border)]',
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
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-[var(--accent-subtle)] border border-[var(--accent-border)]">
                  <img
                    src={currentTrack.artworkUrl}
                    alt={currentTrack.title}
                    className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--accent)] truncate">
                      {currentTrack.title}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {currentTrack.artist?.name ?? 'Unknown Artist'}
                    </p>
                  </div>
                  <div className="flex items-end gap-[2px] ml-auto flex-shrink-0">
                    <span className="eq-bar h-[8px]"  />
                    <span className="eq-bar h-[12px]" />
                    <span className="eq-bar h-[6px]"  />
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
                    Add songs to see them here
                  </p>
                </div>
              )}

            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}