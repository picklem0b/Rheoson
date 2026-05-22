import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayerStore } from '@/store/playerStore'
import { useUIStore } from '@/store/uiStore'
import { usePlayer } from '@/hooks/usePlayer'
import PlayerControls from './PlayerControls'
import ProgressBar from './ProgressBar'
import VolumeControl from './VolumeControl'
import { IconButton } from '@/components/ui/IconButton'
import { ListMusic, Mic2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { truncate } from '@/lib/formatters'

export default function PlayerBar() {
  const navigate   = useNavigate()
  const { currentTrack, isPlaying, isLoading } = usePlayerStore()
  const { showQueue, showLyrics, toggleQueue, toggleLyrics } = useUIStore()

  // ── Nothing playing → render nothing ──────────────────────
  if (!currentTrack) return null

  return (
    <AnimatePresence>
      <motion.div
        key="player-bar"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{    y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className={cn(
          'relative z-30 w-full',
          'glass-strong border-t border-[var(--border)]',
          'px-4 py-3',
        )}
        style={{ height: 'var(--player-height)' }}
      >
        {/* Progress sits flush at the very top of the bar */}
        <div className="absolute top-0 inset-x-0">
          <ProgressBar compact />
        </div>

        <div className="flex items-center gap-3 h-full">

          {/* ── Track info ─────────────────────────────────── */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/now-playing')}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
          >
            {/* Artwork */}
            <div className="relative flex-shrink-0">
              <motion.img
                key={currentTrack.artworkUrl}
                src={currentTrack.artworkUrl}
                alt={currentTrack.title}
                className="w-11 h-11 rounded-xl object-cover shadow-lg"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', damping: 20 }}
              />
              {/* Loading pulse ring */}
              {isLoading && (
                <div className="absolute inset-0 rounded-xl border-2 border-[var(--accent)] animate-pulse-red" />
              )}
              {/* Playing indicator dots */}
              {isPlaying && !isLoading && (
                <div className="absolute -bottom-0.5 -right-0.5 flex items-end gap-[2px] bg-[var(--accent)] rounded-md px-[3px] py-[2px]">
                  <span className="eq-bar h-[6px]" />
                  <span className="eq-bar h-[8px]" />
                  <span className="eq-bar h-[5px]" />
                </div>
              )}
            </div>

            {/* Text */}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight">
                {truncate(currentTrack.title, 28)}
              </p>
              <p className="text-xs text-[var(--text-secondary)] truncate leading-tight mt-0.5">
                {truncate(currentTrack.artist.name, 22)}
              </p>
            </div>
          </motion.button>

          {/* ── Centre controls ─────────────────────────────── */}
          <div className="hidden sm:flex items-center">
            <PlayerControls compact />
          </div>

          {/* Mobile: just play/pause */}
          <div className="flex sm:hidden items-center">
            <PlayerControls mobileOnly />
          </div>

          {/* ── Right actions ────────────────────────────────── */}
          <div className="hidden md:flex items-center gap-1 flex-shrink-0">
            <VolumeControl />
            <IconButton
              size="sm"
              variant="ghost"
              active={showLyrics}
              onClick={toggleLyrics}
              title="Lyrics"
            >
              <Mic2 />
            </IconButton>
            <IconButton
              size="sm"
              variant="ghost"
              active={showQueue}
              onClick={toggleQueue}
              title="Queue"
            >
              <ListMusic />
            </IconButton>
          </div>

        </div>
      </motion.div>
    </AnimatePresence>
  )
}