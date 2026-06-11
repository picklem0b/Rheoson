import { motion } from 'framer-motion'
import { Heart, Play, Shuffle } from 'lucide-react'
import { useQueue } from '@/hooks/useQueue'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { TrackRowSkeleton } from '@/components/ui/Skeleton'
import { formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export default function LikedSongs() {
  const { playAll } = useQueue()

  return (
    <div className="flex flex-col h-full">

      {/* ── Hero ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-shrink-0 px-4 lg:px-8 pt-8 pb-6"
      >
        <div className="flex items-end gap-6">
          <div className="w-28 h-28 lg:w-36 lg:h-36 rounded-3xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shadow-2xl flex-shrink-0">
            <Heart className="w-12 h-12 lg:w-14 lg:h-14 text-white fill-current" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Playlist</p>
            <h1 className="text-3xl lg:text-4xl font-bold text-[var(--text-primary)]">Liked Songs</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-2">248 songs</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6">
          <Button variant="primary" size="lg" onClick={() => {}}>
            <Play className="w-5 h-5 fill-current" />
            Play all
          </Button>
          <Button variant="secondary" size="lg">
            <Shuffle className="w-4 h-4" />
            Shuffle
          </Button>
        </div>
      </motion.div>

      {/* ── Track list ──────────────────────────────────────── */}
      <ScrollArea className="flex-1 px-4 lg:px-8 pb-4">
        <div className="space-y-1">
          {Array.from({ length: 20 }).map((_, i) => (
            <TrackRow key={i} index={i} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function TrackRow({ index }: { index: number }) {
  const GRADIENTS = [
    'from-rose-900 to-red-700',
    'from-violet-900 to-purple-700',
    'from-cyan-900 to-blue-700',
    'from-amber-900 to-orange-700',
  ]

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
      whileTap={{ scale: 0.98 }}
      className="w-full group flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left"
    >
      <span className="text-sm text-[var(--text-muted)] w-5 text-center tabular-nums group-hover:hidden">
        {index + 1}
      </span>
      <Play className="w-4 h-4 text-[var(--text-primary)] fill-current hidden group-hover:block w-5 text-center" />
      <div className={cn(
        'w-11 h-11 rounded-xl flex-shrink-0 bg-gradient-to-br',
        GRADIENTS[index % GRADIENTS.length]
      )} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">Track {index + 1}</p>
        <p className="text-xs text-[var(--text-secondary)] truncate">Artist Name · Album</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <Heart className="w-4 h-4 text-[var(--accent)] fill-current opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="text-xs text-[var(--text-muted)] tabular-nums">3:4{index % 9}</span>
      </div>
    </motion.button>
  )
}