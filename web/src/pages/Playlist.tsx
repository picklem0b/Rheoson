import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play, Shuffle, MoreHorizontal, Heart, Download } from 'lucide-react'
import { useQueue } from '@/hooks/useQueue'
import TopBar from '@/components/layout/TopBar'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'

const GRADIENTS = [
  'from-rose-900 via-rose-800 to-red-900',
  'from-violet-900 via-violet-800 to-purple-900',
  'from-cyan-900 via-cyan-800 to-blue-900',
  'from-amber-900 via-amber-800 to-orange-900',
]

export default function Playlist() {
  const { id } = useParams()

  return (
    <div className="flex flex-col h-full">
      <TopBar transparent />

      <ScrollArea className="flex-1">
        {/* ── Hero ──────────────────────────────────────────── */}
        <div className="relative">
          {/* Blurred gradient bg */}
          <div className={cn(
            'absolute inset-0 bg-gradient-to-b opacity-40',
            GRADIENTS[parseInt(id ?? '0') % GRADIENTS.length]
          )} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--bg-base)]" />

          <div className="relative px-4 lg:px-8 pt-4 pb-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 22 }}
              className="flex flex-col sm:flex-row items-start sm:items-end gap-6"
            >
              <div className={cn(
                'w-44 h-44 rounded-3xl shadow-2xl flex-shrink-0 bg-gradient-to-br',
                GRADIENTS[parseInt(id ?? '0') % GRADIENTS.length]
              )} />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Playlist</p>
                <h1 className="text-3xl font-bold text-[var(--text-primary)]">Playlist {id}</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">34 songs · 2h 14m</p>
              </div>
            </motion.div>

            <div className="flex items-center gap-3 mt-6">
              <Button variant="primary" size="lg">
                <Play className="w-5 h-5 fill-current" />
                Play
              </Button>
              <Button variant="secondary" size="md">
                <Shuffle className="w-4 h-4" />
                Shuffle
              </Button>
              <IconButton size="md" variant="ghost">
                <Heart />
              </IconButton>
              <IconButton size="md" variant="ghost">
                <Download />
              </IconButton>
              <IconButton size="md" variant="ghost">
                <MoreHorizontal />
              </IconButton>
            </div>
          </div>
        </div>

        {/* ── Tracks ────────────────────────────────────────── */}
        <div className="px-4 lg:px-8 pb-8 space-y-1">
          {Array.from({ length: 24 }).map((_, i) => (
            <PlaylistTrackRow key={i} index={i} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function PlaylistTrackRow({ index }: { index: number }) {
  const G = ['from-rose-900 to-red-700', 'from-violet-900 to-purple-700', 'from-cyan-900 to-blue-700', 'from-amber-900 to-orange-700']
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025 }}
      whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
      whileTap={{ scale: 0.98 }}
      className="w-full group flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left"
    >
      <span className="text-sm text-[var(--text-muted)] w-5 text-center tabular-nums group-hover:hidden">{index + 1}</span>
      <Play className="w-4 h-4 text-[var(--text-primary)] fill-current hidden group-hover:block" />
      <div className={cn('w-11 h-11 rounded-xl flex-shrink-0 bg-gradient-to-br', G[index % G.length])} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">Track {index + 1}</p>
        <p className="text-xs text-[var(--text-secondary)] truncate">Artist · Album</p>
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">3:2{index % 9}</span>
    </motion.button>
  )
}