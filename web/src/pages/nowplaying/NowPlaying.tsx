import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import {
  ChevronDown, Heart, MoreHorizontal, Download,
  Shuffle, SkipBack, SkipForward, Repeat, Repeat1,
  Mic2, ListMusic, Radio, Share2, UserPlus, Plus,
  Clock, Flag, Music2, Play, Pause,
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useUIStore } from '@/store/uiStore'
import { usePlayer } from '@/hooks/usePlayer'
import { useQueue } from '@/hooks/useQueue'
import { useLyrics } from '@/hooks/useLyrics'
import { tracksApi } from '@/api/tracks'
import ProgressBar from '@/components/player/ProgressBar'
import QueuePanel from '@/components/player/QueuePanel'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { truncate, formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────

type Tab = 'playlist' | 'lyric' | 'related'

// ── Context menu sheet ────────────────────────────────────────

const MENU_ITEMS = [
  { icon: Heart,    label: 'Like'              },
  { icon: Download, label: 'Remove from Offline', downloaded: true },
  { icon: Plus,     label: 'Add to playlist'   },
  { icon: UserPlus, label: 'Singer'            },
  { icon: Clock,    label: 'Sleep Timer · Off' },
  { icon: Share2,   label: 'Share'             },
  { icon: Music2,   label: 'Detail'            },
  { icon: Flag,     label: 'Report'            },
]

function ContextSheet({
  track,
  onClose,
}: {
  track: { title: string; artist: { name: string }; artworkUrl: string }
  onClose: () => void
}) {
  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="relative z-10 bg-[var(--bg-surface)] rounded-t-3xl overflow-hidden"
      >
        {/* Track header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
          <img
            src={track.artworkUrl}
            alt={track.title}
            className="w-12 h-12 rounded-2xl object-cover flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[var(--text-primary)] truncate">{track.title}</p>
            <p className="text-sm text-[var(--text-muted)] truncate">
              Video · {track.artist.name} · 1.1M views
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)]">
            ✕
          </button>
        </div>

        <div className="px-2 py-2 pb-safe">
          {MENU_ITEMS.map(({ icon: Icon, label, downloaded }) => (
            <motion.button
              key={label}
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-[var(--bg-elevated)] transition-colors text-left"
            >
              <div className="relative">
                <Icon className="w-5 h-5 text-[var(--text-secondary)]" />
                {downloaded && (
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-[var(--accent)] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                )}
              </div>
              <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Lyrics tab ────────────────────────────────────────────────

function LyricsTab({
  lines,
  activeLine,
  synced,
}: {
  lines: { text: string; startTime?: number }[]
  activeLine: number
  synced: boolean
}) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <Mic2 className="w-10 h-10 text-[var(--text-muted)]" />
        <p className="text-[var(--text-secondary)] font-semibold">No lyrics found</p>
        <p className="text-[var(--text-muted)] text-sm">Lyrics aren't available for this track</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 py-4">
      {!synced && (
        <p className="text-xs text-[var(--text-muted)] text-center mb-2">Unsynced</p>
      )}
      {lines.map((line, i) => (
        <motion.p
          key={i}
          animate={{
            opacity: i === activeLine ? 1 : 0.38,
            scale:   i === activeLine ? 1.02 : 1,
          }}
          transition={{ duration: 0.25 }}
          className={cn(
            'text-lg leading-relaxed text-center transition-all duration-300',
            i === activeLine
              ? 'font-bold text-[var(--text-primary)]'
              : 'font-medium text-[var(--text-secondary)]',
          )}
        >
          {line.text}
        </motion.p>
      ))}
    </div>
  )
}

// ── Queue tab (Playlist) ──────────────────────────────────────

function PlaylistTab() {
  const { queue, history } = useQueue()
  const { currentTrack }   = usePlayerStore()
  const { playTrack }      = useQueue()

  const all = [...history, ...(currentTrack ? [currentTrack] : []), ...queue]

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <ListMusic className="w-10 h-10 text-[var(--text-muted)]" />
        <p className="text-[var(--text-secondary)] font-semibold">Queue is empty</p>
      </div>
    )
  }

  return (
    <div className="space-y-1 py-2">
      {all.map((track, i) => {
        const isCurrent = track.id === currentTrack?.id
        return (
          <motion.button
            key={`${track.id}-${i}`}
            whileTap={{ scale: 0.98 }}
            onClick={() => !isCurrent && playTrack(track, all)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left',
              isCurrent ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--bg-elevated)]',
            )}
          >
            {track.artworkUrl
              ? <img src={track.artworkUrl} alt={track.title} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
              : <div className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)] flex-shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-sm font-semibold truncate',
                isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]',
              )}>
                {track.title}
              </p>
              <p className="text-xs text-[var(--text-secondary)] truncate">{track.artist.name}</p>
            </div>
            {isCurrent && (
              <div className="flex gap-0.5 items-end h-4 flex-shrink-0">
                {[0, 1, 2].map((j) => (
                  <motion.div
                    key={j}
                    className="w-0.5 bg-[var(--accent)] rounded-full"
                    animate={{ height: ['40%', '100%', '60%'] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: j * 0.15 }}
                  />
                ))}
              </div>
            )}
            {!isCurrent && (
              <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">
                {formatDuration(track.duration)}
              </span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

// ── Related tab ───────────────────────────────────────────────

function RelatedTab({ trackId }: { trackId: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <Radio className="w-10 h-10 text-[var(--text-muted)]" />
      <p className="text-[var(--text-secondary)] font-semibold">Recommended radios</p>
      <p className="text-[var(--text-muted)] text-sm">Coming soon</p>
    </div>
  )
}

// ── Controls ──────────────────────────────────────────────────

function Controls() {
  const { isPlaying, repeatMode, isShuffled, cycleRepeat, toggleShuffle } = usePlayerStore()
  const { togglePlay, skipNext, skipPrev } = usePlayer()

  return (
    <div className="flex items-center justify-between w-full px-2">
      {/* Shuffle */}
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={toggleShuffle}
        className={cn(
          'w-10 h-10 flex items-center justify-center rounded-full transition-colors',
          isShuffled ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
        )}
      >
        <Shuffle className="w-5 h-5" />
      </motion.button>

      {/* Prev */}
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={skipPrev}
        className="w-12 h-12 flex items-center justify-center text-[var(--text-primary)]"
      >
        <SkipBack className="w-7 h-7 fill-current" />
      </motion.button>

      {/* Play/Pause */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={togglePlay}
        className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-xl"
      >
        {isPlaying
          ? <Pause className="w-7 h-7 text-black fill-current" />
          : <Play  className="w-7 h-7 text-black fill-current ml-0.5" />
        }
      </motion.button>

      {/* Next */}
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={skipNext}
        className="w-12 h-12 flex items-center justify-center text-[var(--text-primary)]"
      >
        <SkipForward className="w-7 h-7 fill-current" />
      </motion.button>

      {/* Repeat */}
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={cycleRepeat}
        className={cn(
          'w-10 h-10 flex items-center justify-center rounded-full transition-colors',
          repeatMode !== 'off' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
        )}
      >
        {repeatMode === 'one'
          ? <Repeat1 className="w-5 h-5" />
          : <Repeat  className="w-5 h-5" />
        }
      </motion.button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function NowPlaying() {
  const navigate = useNavigate()
  const { currentTrack, isPlaying, isLiked } = usePlayerStore() as any
  const { lines, activeLine, synced } = useLyrics(currentTrack?.id)
  const [tab,      setTab]      = useState<Tab>('playlist')
  const [showMenu, setShowMenu] = useState(false)

  // Swipe-down-to-dismiss
  const dragY    = useMotionValue(0)
  const opacity  = useTransform(dragY, [0, 200], [1, 0])
  const scale    = useTransform(dragY, [0, 200], [1, 0.92])

  if (!currentTrack) {
    navigate(-1)
    return null
  }

  return (
    <motion.div
      style={{ opacity, scale }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black"
    >
      {/* ── Blurred artwork background ────────────────────── */}
      <div className="absolute inset-0">
        <img
          src={currentTrack.artworkUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-110"
          style={{ filter: 'blur(40px)', opacity: 0.35 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-black/90" />
      </div>

      {/* ── Drag-to-dismiss handle ────────────────────────── */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.4 }}
        style={{ y: dragY }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120) navigate(-1)
          else dragY.set(0)
        }}
        className="absolute inset-x-0 top-0 h-16 z-20 flex items-start justify-center pt-3"
      >
        <div className="w-10 h-1 rounded-full bg-white/30" />
      </motion.div>

      {/* ── Content ───────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col h-full">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-safe pt-10 pb-2 flex-shrink-0">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
          >
            <ChevronDown className="w-5 h-5 text-white" />
          </motion.button>

          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">
              Now Playing
            </p>
          </div>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowMenu(true)}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
          >
            <MoreHorizontal className="w-5 h-5 text-white" />
          </motion.button>
        </div>

        {/* Artwork — large, centered, takes up top half */}
        <div className="flex-shrink-0 flex items-center justify-center px-8 py-4">
          <motion.div
            key={currentTrack.id}
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: isPlaying ? 1 : 0.94 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="w-full max-w-xs aspect-square"
          >
            <img
              src={currentTrack.artworkUrl}
              alt={currentTrack.title}
              className="w-full h-full rounded-3xl object-cover shadow-2xl"
              style={{
                boxShadow: isPlaying
                  ? '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)'
                  : '0 12px 30px rgba(0,0,0,0.5)',
              }}
            />
          </motion.div>
        </div>

        {/* Track info + like + download */}
        <div className="flex items-center gap-3 px-6 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <motion.h2
              key={currentTrack.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl font-bold text-white truncate"
            >
              {currentTrack.title}
            </motion.h2>
            <p className="text-sm text-white/60 truncate mt-0.5">
              {currentTrack.artist.name}
            </p>
          </div>

          <motion.button
            whileTap={{ scale: 0.85 }}
            className="w-9 h-9 flex items-center justify-center"
          >
            <Heart className={cn(
              'w-6 h-6 transition-colors',
              currentTrack.isLiked ? 'text-[var(--accent)] fill-current' : 'text-white/60',
            )} />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.85 }}
            className="w-9 h-9 flex items-center justify-center"
          >
            <Download className="w-5 h-5 text-white/60" />
          </motion.button>
        </div>

        {/* Progress bar */}
        <div className="px-6 mt-4 flex-shrink-0">
          <ProgressBar large />
        </div>

        {/* Controls */}
        <div className="px-4 mt-3 flex-shrink-0">
          <Controls />
        </div>

        {/* ── Tabs: Playlist / Lyric / Related ─────────────── */}
        <div className="flex-shrink-0 px-6 mt-5 border-b border-white/10">
          <div className="flex gap-6">
            {(['playlist', 'lyric', 'related'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'pb-3 text-sm font-bold capitalize transition-colors border-b-2 -mb-px',
                  tab === t
                    ? 'text-white border-white'
                    : 'text-white/40 border-transparent',
                )}
              >
                {t === 'playlist' ? 'Playlist' : t === 'lyric' ? 'Lyric' : 'Related'}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full px-6 pb-safe pb-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0  }}
                exit={{   opacity: 0, y: -6  }}
                transition={{ duration: 0.18 }}
              >
                {tab === 'playlist' && <PlaylistTab />}
                {tab === 'lyric'    && (
                  <LyricsTab
                    lines={lines}
                    activeLine={activeLine}
                    synced={synced}
                  />
                )}
                {tab === 'related'  && <RelatedTab trackId={currentTrack.id} />}
              </motion.div>
            </AnimatePresence>
          </ScrollArea>
        </div>
      </div>

      {/* ── Context menu sheet ────────────────────────────── */}
      <AnimatePresence>
        {showMenu && (
          <ContextSheet track={currentTrack} onClose={() => setShowMenu(false)} />
        )}
      </AnimatePresence>
    </motion.div>
  )
}