import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import {
  ChevronDown, Heart, MoreHorizontal, Download,
  Mic2, ListMusic, Radio, Share2, UserPlus, Plus,
  Clock, Flag, Music2, X,
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useUIStore } from '@/store/uiStore'
import { useQueue } from '@/hooks/useQueue'
import { useLyrics } from '@/hooks/useLyrics'
import { tracksApi } from '@/api/tracks'
import PlayerControls from '@/components/player/PlayerControls'
import ProgressBar from '@/components/player/ProgressBar'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Spinner } from '@/components/ui/Spinner'
import { truncate, formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Track } from '@/types/track'

type Tab = 'playlist' | 'lyric' | 'related'

// ── Context menu sheet ────────────────────────────────────────

const MENU_ITEMS = [
  { icon: Heart,    label: 'Like'                            },
  { icon: Download, label: 'Remove from Offline', badge: true },
  { icon: Plus,     label: 'Add to playlist'                 },
  { icon: UserPlus, label: 'Singer'                          },
  { icon: Clock,    label: 'Sleep Timer · Off'               },
  { icon: Share2,   label: 'Share'                           },
  { icon: Music2,   label: 'Detail'                          },
  { icon: Flag,     label: 'Report'                          },
]

function ContextSheet({
  track,
  onClose,
}: {
  track: Track
  onClose: () => void
}) {
  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
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
              {track.artist.name}
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center"
          >
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </motion.button>
        </div>

        <div className="px-2 py-2 pb-safe">
          {MENU_ITEMS.map(({ icon: Icon, label, badge }) => (
            <motion.button
              key={label}
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-[var(--bg-elevated)] transition-colors text-left"
            >
              <div className="relative flex-shrink-0">
                <Icon className="w-5 h-5 text-[var(--text-secondary)]" />
                {badge && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[var(--accent)] flex items-center justify-center">
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
  isLoading,
}: {
  lines: { text: string; startTime?: number }[]
  activeLine: number
  synced: boolean
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="md" />
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <Mic2 className="w-10 h-10 text-[var(--text-muted)]" />
        <p className="text-[var(--text-secondary)] font-semibold">No lyrics found</p>
        <p className="text-[var(--text-muted)] text-sm">
          Lyrics aren't available for this track
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 py-4 pb-8">
      {!synced && (
        <p className="text-xs text-[var(--text-muted)] text-center">Unsynced</p>
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

// ── Playlist tab ──────────────────────────────────────────────

function PlaylistTab({ currentTrack }: { currentTrack: Track }) {
  const { queue, history, playTrack } = useQueue()
  const all = [...history, currentTrack, ...queue]

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <ListMusic className="w-10 h-10 text-[var(--text-muted)]" />
        <p className="text-[var(--text-secondary)] font-semibold">Queue is empty</p>
      </div>
    )
  }

  return (
    <div className="space-y-1 py-2 pb-8">
      {all.map((track, i) => {
        const isCurrent = track.id === currentTrack.id
        return (
          <motion.button
            key={`${track.id}-${i}`}
            whileTap={{ scale: 0.98 }}
            onClick={() => !isCurrent && playTrack(track, all)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left',
              isCurrent
                ? 'bg-[var(--accent-subtle)]'
                : 'hover:bg-[var(--bg-elevated)]',
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
              <p className="text-xs text-[var(--text-secondary)] truncate">
                {track.artist.name}
              </p>
            </div>

            {isCurrent ? (
              // Animated EQ bars for current track
              <div className="flex items-end gap-[2px] h-4 flex-shrink-0">
                {[0, 1, 2].map((j) => (
                  <motion.div
                    key={j}
                    className="w-[2px] bg-[var(--accent)] rounded-full"
                    animate={{ height: ['40%', '100%', '60%'] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: j * 0.15 }}
                  />
                ))}
              </div>
            ) : (
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

function RelatedTab() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center pb-8">
      <Radio className="w-10 h-10 text-[var(--text-muted)]" />
      <p className="text-[var(--text-secondary)] font-semibold">Recommended radios</p>
      <p className="text-[var(--text-muted)] text-sm">Coming soon</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function NowPlaying() {
  const navigate = useNavigate()

  // Selective selectors — avoids re-render on progress ticks
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying    = usePlayerStore((s) => s.isPlaying)
  const isLoading    = usePlayerStore((s) => s.isLoading)

  const { lines, activeLine, synced, isLoading: lyricsLoading } = useLyrics(currentTrack?.id)

  const [tab,      setTab]      = useState<Tab>('playlist')
  const [showMenu, setShowMenu] = useState(false)
  const [liked,    setLiked]    = useState(currentTrack?.isLiked ?? false)

  // Swipe-down-to-dismiss
  const dragY   = useMotionValue(0)
  const opacity = useTransform(dragY, [0, 200], [1, 0])
  const scale   = useTransform(dragY, [0, 200], [1, 0.94])

  const handleLike = async () => {
    if (!currentTrack) return
    const next = !liked
    setLiked(next)
    try {
      next
        ? await tracksApi.likeTrack(currentTrack.id)
        : await tracksApi.unlikeTrack(currentTrack.id)
    } catch {
      setLiked(!next)
    }
  }

  if (!currentTrack) {
    navigate(-1)
    return null
  }

  return (
    <motion.div
      style={{ opacity, scale }}
      className="fixed inset-0 z-50 flex flex-col bg-black overflow-hidden"
    >
      {/* ── Blurred artwork background ────────────────────── */}
      <div className="absolute inset-0 pointer-events-none">
        <img
          src={currentTrack.artworkUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-110"
          style={{ filter: 'blur(40px)', opacity: 0.35 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/60 to-black/95" />
      </div>

      {/* ── Drag-to-dismiss handle ─────────────────────────── */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.4 }}
        style={{ y: dragY }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120) navigate(-1)
          else dragY.set(0)
        }}
        className="absolute inset-x-0 top-0 h-12 z-20 flex items-start justify-center pt-2.5 cursor-grab"
      >
        <div className="w-10 h-1 rounded-full bg-white/25" />
      </motion.div>

      {/* ── Main content — scrollable on mobile ───────────── */}
      <div className="relative z-10 flex flex-col h-full overflow-y-auto no-scrollbar">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-10 pb-2 flex-shrink-0">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
          >
            <ChevronDown className="w-5 h-5 text-white" />
          </motion.button>

          <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">
            Now Playing
          </p>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowMenu(true)}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
          >
            <MoreHorizontal className="w-5 h-5 text-white" />
          </motion.button>
        </div>

        {/* Artwork */}
        <div className="flex-shrink-0 flex items-center justify-center px-8 py-2">
          <div className="relative w-full max-w-[280px] aspect-square">
            <motion.img
              key={currentTrack.id}
              src={currentTrack.artworkUrl}
              alt={currentTrack.title}
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: isPlaying ? 1 : 0.94 }}
              transition={{ type: 'spring', damping: 22, stiffness: 260 }}
              className="w-full h-full rounded-3xl object-cover"
              style={{
                boxShadow: isPlaying
                  ? '0 24px 60px rgba(0,0,0,0.7)'
                  : '0 12px 30px rgba(0,0,0,0.5)',
              }}
            />

            {/* Loading overlay on artwork */}
            <AnimatePresence>
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 rounded-3xl bg-black/50 flex items-center justify-center"
                >
                  <Spinner size="lg" className="border-white" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Track info + like + download */}
        <div className="flex items-center gap-3 px-6 pt-1 pb-2 flex-shrink-0">
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

          <motion.button whileTap={{ scale: 0.85 }} onClick={handleLike}>
            <Heart className={cn(
              'w-6 h-6 transition-colors',
              liked ? 'text-[var(--accent)] fill-current' : 'text-white/60',
            )} />
          </motion.button>

          <motion.button whileTap={{ scale: 0.85 }}>
            <Download className="w-5 h-5 text-white/60" />
          </motion.button>
        </div>

        {/* Progress bar */}
        <div className="px-6 flex-shrink-0">
          <ProgressBar large />
        </div>

        {/* Controls — using shared PlayerControls so spinner/play/pause is consistent */}
        <div className="px-4 mt-2 flex-shrink-0 flex justify-center">
          <PlayerControls large />
        </div>

        {/* ── Tabs ──────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-6 mt-4 border-b border-white/10">
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

        {/* Tab content — NOT overflow-hidden, just padding at bottom */}
        {/* Scrolling is handled by the outer overflow-y-auto container */}
        <div className="px-6 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8  }}
              animate={{ opacity: 1, y: 0  }}
              exit={{   opacity: 0, y: -6  }}
              transition={{ duration: 0.15 }}
            >
              {tab === 'playlist' && (
                <PlaylistTab currentTrack={currentTrack} />
              )}
              {tab === 'lyric' && (
                <LyricsTab
                  lines={lines}
                  activeLine={activeLine}
                  synced={synced}
                  isLoading={lyricsLoading}
                />
              )}
              {tab === 'related' && <RelatedTab />}
            </motion.div>
          </AnimatePresence>
        </div>

      </div>

      {/* ── Context menu sheet ────────────────────────────── */}
      <AnimatePresence>
        {showMenu && (
          <ContextSheet
            track={currentTrack}
            onClose={() => setShowMenu(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}