import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ArtworkDisplayProps {
  trackId:    string
  artworkUrl: string
  title:      string
  isPlaying:  boolean
}

export default function ArtworkDisplay({ trackId, artworkUrl, title, isPlaying }: ArtworkDisplayProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={trackId}
        initial={{ opacity: 0, scale: 0.85, y: 20 }}
        animate={{ opacity: 1, scale: isPlaying ? 1 : 0.92, y: 0 }}
        exit={{   opacity: 0, scale: 0.85 }}
        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
        className="flex-shrink-0 my-6"
      >
        <div className="relative mx-auto w-full max-w-sm aspect-square">
          <img
            src={artworkUrl}
            alt={title}
            className={cn(
              'w-full h-full rounded-3xl object-cover shadow-2xl',
              'transition-transform duration-700',
              isPlaying ? 'shadow-[0_20px_60px_rgba(0,0,0,0.6)]' : '',
            )}
          />
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
  )
}
