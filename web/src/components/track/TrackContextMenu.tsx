import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Play,
  ListPlus,
  Download,
  Heart,
  Share2,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useContextMenuStore } from '@/store/contextMenu.store'
import { useQueue } from '@/hooks/queue.hook'
import { usePlaylistMenuStore } from '@/store/playlistMenu.store'
import { useUIStore } from '@/store/ui.store'
import { useToast } from '@/components/ui/Toaster'
import { tracksApi } from '@/api/tracks.api'
import { ArtworkImage } from '@/components/ui/ArtworkImage'
import { truncate } from '@/lib/formatters'
import type { Track } from '@/types/track.types'

/**
 * Universal track context menu — mounted once in RootLayout.
 *
 * 'pointer' mode renders a popover at the cursor (right-click);
 * 'sheet' mode renders a bottom-sheet modal (touch long-press).
 * Both share the same actions.
 */
export function TrackContextMenu() {
  const { track, mode, x, y, close } = useContextMenuStore()
  const open = !!track

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, close])

  if (!track) return null
  if (mode === 'sheet') return <SheetMenu track={track} onClose={close} />
  return <PointerMenu track={track} x={x} y={y} onClose={close} />
}

// ── Menu actions (shared) ─────────────────────────────────────

function useMenuActions(track: Track, onClose: () => void) {
  const { playTrack, addToQueue } = useQueue()
  const openPlaylistMenu = usePlaylistMenuStore((s) => s.openForTrack)
  const openDownloadModal = useUIStore((s) => s.openDownloadModal)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const refreshLikes = () => {
    queryClient.invalidateQueries({ queryKey: ['liked-tracks'] })
    queryClient.invalidateQueries({ queryKey: ['liked-count'] })
    queryClient.invalidateQueries({ queryKey: ['tracks'] })
  }

  const actions = [
    {
      id: 'play',
      label: 'Play now',
      icon: <Play className="w-4 h-4" />,
      run: () => {
        playTrack(track)
        onClose()
      },
    },
    {
      id: 'next',
      label: 'Play next',
      icon: <ListPlus className="w-4 h-4 rotate-90" />,
      run: () => {
        const added = addToQueue(track)
        toast(
          added ? `Queued "${truncate(track.title, 22)}"` : 'Already in queue',
          added ? 'success' : 'info',
          1800
        )
        onClose()
      },
    },
    {
      id: 'playlist',
      label: 'Add to playlist',
      icon: <ListPlus className="w-4 h-4" />,
      run: () => {
        onClose()
        // The sheet opens its own modal on top
        window.setTimeout(() => openPlaylistMenu(track), 50)
      },
    },
    {
      id: 'download',
      label: 'Download',
      icon: <Download className="w-4 h-4" />,
      run: () => {
        openDownloadModal(track.id)
        toast(`"${truncate(track.title, 24)}" added to downloads`, 'info', 2500)
        onClose()
      },
    },
    {
      id: 'like',
      label: track.isLiked ? 'Remove from liked' : 'Like',
      icon: (
        <Heart
          className={`w-4 h-4 ${track.isLiked ? 'text-[var(--accent)] fill-current' : ''}`}
        />
      ),
      run: async () => {
        if (track.isLiked) {
          await tracksApi.unlikeTrack(track.id)
          toast('Removed from liked songs', 'info', 1800)
        } else {
          await tracksApi.likeTrack(track.id)
          toast('Added to liked songs', 'success', 1800)
        }
        refreshLikes()
        onClose()
      },
    },
    {
      id: 'share',
      label: 'Share',
      icon: <Share2 className="w-4 h-4" />,
      run: async () => {
        await shareTrack(track)
        onClose()
      },
    },
  ]

  return actions
}

async function shareTrack(track: Track) {
  const text = `${track.title} — ${track.artist?.name ?? 'Unknown Artist'}`
  const url = track.youtubeId
    ? `https://music.youtube.com/watch?v=${track.youtubeId}`
    : undefined

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: track.title, text, url })
      return
    } catch {
      // user cancelled — fall through to clipboard
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text)
  }
}

// ── Shared row rendering ──────────────────────────────────────

interface MenuRowProps {
  label: string
  icon: React.ReactNode
  danger?: boolean
  onRun: () => void
}

function MenuRow({ label, icon, danger, onRun }: MenuRowProps) {
  return (
    <button
      onClick={onRun}
      className={cnRow(danger)}
    >
      <span className={danger ? 'text-red-400' : 'text-[var(--text-secondary)]'}>{icon}</span>
      <span className={danger ? 'text-red-400' : 'text-[var(--text-primary)]'}>{label}</span>
    </button>
  )
}

function cnRow(danger?: boolean) {
  return [
    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition-colors',
    danger
      ? 'text-red-400 hover:bg-red-500/10'
      : 'hover:bg-[var(--bg-elevated)] active:bg-[var(--bg-elevated)]',
  ].join(' ')
}

function MenuHeader({ track }: { track: Track }) {
  return (
    <div className="flex items-center gap-3 mb-2 px-1">
      <ArtworkImage src={track.artworkUrl} alt={track.title} size={44} radius="rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[var(--text-primary)] truncate">{track.title}</p>
        <p className="text-xs text-[var(--text-secondary)] truncate">
          {track.artist?.name ?? 'Unknown Artist'}
        </p>
      </div>
    </div>
  )
}

// ── Pointer popover ───────────────────────────────────────────

function PointerMenu({
  track,
  x,
  y,
  onClose,
}: {
  track: Track
  x: number
  y: number
  onClose: () => void
}) {
  const actions = useMenuActions(track, onClose)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Clamp to the viewport once we know the menu's size
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    })
  }, [x, y])

  return (
    <>
      {/* Invisible layer — catches the outside click to close */}
      <div className="fixed inset-0 z-[70]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.95, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 380 }}
        style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 71, width: 240 }}
        className="glass-strong rounded-2xl p-2 shadow-2xl border border-[var(--border)]"
      >
        <MenuHeader track={track} />
        <div className="space-y-0.5">
          {actions.map((a) => (
            <MenuRow key={a.id} label={a.label} icon={a.icon} onRun={a.run} />
          ))}
        </div>
      </motion.div>
    </>
  )
}

// ── Bottom sheet (mobile long-press) ──────────────────────────

function SheetMenu({ track, onClose }: { track: Track; onClose: () => void }) {
  const actions = useMenuActions(track, onClose)

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative z-10 w-full max-w-md mx-auto mb-4 px-3"
      >
        <div className="glass-strong rounded-3xl p-3 shadow-2xl border border-[var(--border)]">
          <MenuHeader track={track} />
          <div className="space-y-0.5">
            {actions.map((a) => (
              <MenuRow key={a.id} label={a.label} icon={a.icon} onRun={a.run} />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}