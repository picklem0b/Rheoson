import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, Heart, MoreHorizontal,
  Share2, Download, Mic2, ListMusic,
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useUIStore } from '@/store/uiStore'
import { usePlayer } from '@/hooks/usePlayer'
import { useLyrics } from '@/hooks/useLyrics'
import PlayerControls from '@/components/player/PlayerControls'
import ProgressBar from '@/components/player/ProgressBar'
import VolumeControl from '@/components/player/VolumeControl'
import QueuePanel from '@/components/player/QueuePanel'
import { IconButton } from '@/components/ui/IconButton'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { truncate } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export default function NowPlaying() {
  const navigate      = useNavigate()
  const { currentTrack, isPlaying } = usePlayerStore()
  const { showLyrics, showQueue, toggleLyrics, toggleQueue } = useUIStore()
  const { lines, activeLine, synced } = useLyrics(currentTrack?.id)

  // No track — go back
  if (!currentTrack) {
    navigate(-1)
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{   opacity: 0, y: 30 }}
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Dynamic blurred artwork background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.img
          key={currentTrack.artworkUrl}
          src={currentTrack.artworkUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-125"
          style={{ filter: 'blur(80px)', opacity: 0.25 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.25 }}
          transition={{ duration: 0.8 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--bg-base)]/60 via-[var(--bg-base)]/40 to-[var(--bg-base)]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full max-w-lg mx-auto w-full px-6">

        {/* ── Top bar ───────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-safe pt-4 pb-2">
          <IconButton size="md" variant="glass" onClick={() => navigate(-1)}>
            <ChevronDown />
          </IconButton>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Now Playing</p>
          </div>
          <IconButton size="md" variant="glass">
            <MoreHorizontal />
          </IconButton>
        </div>

        {/* ── Artwork ────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTrack.id}
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: isPlaying ? 1 : 0.92, y: 0 }}
            exit={{   opacity: 0, scale: 0.85 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="flex-shrink-0 my-6"
          >
            <div className="relative mx-auto w-full max-w-sm aspect-square">
              <img
                src={currentTrack.artworkUrl}
                alt={currentTrack.title}
                className={cn(
                  'w-full h-full rounded-3xl object-cover shadow-2xl',
                  'transition-transform duration-700',
                  isPlaying ? 'shadow-[0_20px_60px_rgba(0,0,0,0.6)]' : ''
                )}
              />
              {/* Vinyl ring when playing */}
              {isPlaying && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 rounded-3xl border-2 border-[var(--accent)]/20"
                />
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ── Track info + like ─────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 flex-shrink-0">
          <motion.div
            key={currentTrack.id + '-info'}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="min-w-0"
          >
            <h2 className="text-2xl font-bold text-[var(--text-primary)] truncate leading-tight">
              {truncate(currentTrack.title, 30)}
            </h2>
            <p className="text-base text-[var(--text-secondary)] truncate mt-1">
              {currentTrack.artist.name}
            </p>
          </motion.div>
          <div className="flex items-center gap-1 flex-shrink-0 mt-1">
            <IconButton
              size="md"
              variant="ghost"
              active={currentTrack.isLiked}
              className={cn(currentTrack.isLiked && 'text-[var(--accent)]')}
            >
              <Heart className={cn(currentTrack.isLiked && 'fill-current')} />
            </IconButton>
            <IconButton size="md" variant="ghost">
              <Share2 />
            </IconButton>
          </div>
        </div>

        {/* ── Progress ──────────────────────────────────────── */}
        <div className="mt-6 flex-shrink-0">
          <ProgressBar large />
        </div>

        {/* ── Controls ──────────────────────────────────────── */}
        <div className="flex justify-center mt-4 flex-shrink-0">
          <PlayerControls large />
        </div>

        {/* ── Volume ────────────────────────────────────────── */}
        <div className="flex justify-center mt-6 flex-shrink-0">
          <div className="w-56">
            <VolumeControl />
          </div>
        </div>

        {/* ── Bottom actions ────────────────────────────────── */}
        <div className="flex items-center justify-between mt-6 mb-safe pb-6 flex-shrink-0">
          <IconButton size="sm" variant="glass">
            <Download />
          </IconButton>

          <div className="flex gap-2">
            <IconButton
              size="sm"
              variant="glass"
              active={showLyrics}
              onClick={toggleLyrics}
            >
              <Mic2 />
            </IconButton>
            <IconButton
              size="sm"
              variant="glass"
              active={showQueue}
              onClick={toggleQueue}
            >
              <ListMusic />
            </IconButton>
          </div>
        </div>

        {/* ── Lyrics overlay ────────────────────────────────── */}
        <AnimatePresence>
          {showLyrics && lines.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{   opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="absolute inset-x-0 bottom-0 top-24 glass-strong rounded-t-3xl z-20 overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Mic2 className="w-4 h-4 text-[var(--accent)]" />
                  <span className="font-bold text-[var(--text-primary)]">Lyrics</span>
                  {!synced && <span className="text-xs text-[var(--text-muted)]">· Unsynced</span>}
                </div>
                <IconButton size="sm" variant="ghost" onClick={toggleLyrics}>
                  <ChevronDown />
                </IconButton>
              </div>
              <ScrollArea className="h-[calc(100%-60px)] px-6 py-4">
                <div className="space-y-4 pb-8">
                  {lines.map((line, i) => (
                    <motion.p
                      key={i}
                      animate={{
                        opacity: i === activeLine ? 1 : 0.35,
                        scale:   i === activeLine ? 1.02 : 1,
                      }}
                      transition={{ duration: 0.3 }}
                      className={cn(
                        'text-lg leading-relaxed transition-all duration-300',
                        i === activeLine
                          ? 'font-bold text-[var(--text-primary)]'
                          : 'font-medium text-[var(--text-secondary)]'
                      )}
                    >
                      {line.text}
                    </motion.p>
                  ))}
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Queue panel */}
      <QueuePanel />
    </motion.div>
  )
}