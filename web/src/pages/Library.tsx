import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Grid3X3, List, Music2, Disc3, User, Heart } from 'lucide-react'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/utils'

type LibTab = 'playlists' | 'albums' | 'artists'

const TABS: { id: LibTab; label: string; icon: React.ReactNode }[] = [
  { id: 'playlists', label: 'Playlists', icon: <Music2 className="w-4 h-4" /> },
  { id: 'albums',    label: 'Albums',    icon: <Disc3  className="w-4 h-4" /> },
  { id: 'artists',   label: 'Artists',   icon: <User   className="w-4 h-4" /> },
]

const GRADIENTS = [
  'from-violet-900 to-purple-700',
  'from-rose-900 to-red-700',
  'from-cyan-900 to-blue-700',
  'from-amber-900 to-orange-700',
  'from-emerald-900 to-green-700',
  'from-pink-900 to-rose-700',
]

export default function Library() {
  const navigate   = useNavigate()
  const [tab, setTab]   = useState<LibTab>('playlists')
  const [grid, setGrid] = useState(true)

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-4 lg:px-8 pt-6 pb-3 flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Library</h1>
          <div className="flex items-center gap-1">
            <IconButton size="sm" variant="ghost" onClick={() => setGrid(!grid)}>
              {grid ? <List /> : <Grid3X3 />}
            </IconButton>
            <IconButton size="sm" variant="accent">
              <Plus />
            </IconButton>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {TABS.map((t) => (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.93 }}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200',
                tab === t.id
                  ? 'bg-[var(--text-primary)] text-[var(--bg-base)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)]'
              )}
            >
              {t.icon}
              {t.label}
            </motion.button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 lg:px-8 pb-4">

        {/* Liked songs pinned card */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/liked')}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-3xl mb-4 mt-2',
            'bg-gradient-to-r from-violet-900/60 to-purple-800/40',
            'border border-violet-500/20 hover:border-violet-500/40 transition-all duration-200'
          )}
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <Heart className="w-6 h-6 text-white fill-current" />
          </div>
          <div className="text-left">
            <p className="font-bold text-[var(--text-primary)]">Liked Songs</p>
            <p className="text-sm text-[var(--text-secondary)]">248 songs</p>
          </div>
        </motion.button>

        {/* Grid / List */}
        {tab === 'playlists' && (
          grid
            ? <GridView count={8} type="playlist" />
            : <ListView count={8} type="playlist" />
        )}
        {tab === 'albums' && (
          grid
            ? <GridView count={10} type="album" />
            : <ListView count={10} type="album" />
        )}
        {tab === 'artists' && (
          <ArtistView count={12} />
        )}
      </ScrollArea>
    </div>
  )
}

function GridView({ count, type }: { count: number; type: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
      {Array.from({ length: count }).map((_, i) => (
        <motion.button
          key={i}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.04 }}
          whileHover={{ scale: 1.03, y: -3 }}
          whileTap={{ scale: 0.97 }}
          className="text-left group"
        >
          <div className={cn(
            'w-full aspect-square rounded-3xl mb-3 relative overflow-hidden',
            'bg-gradient-to-br border border-[var(--border)] shadow-md',
            GRADIENTS[i % GRADIENTS.length]
          )}>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-xl">
                <motion.div whileTap={{ scale: 0.9 }}>
                  ▶
                </motion.div>
              </div>
            </div>
          </div>
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{type} {i + 1}</p>
          <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">Artist Name</p>
        </motion.button>
      ))}
    </div>
  )
}

function ListView({ count, type }: { count: number; type: string }) {
  return (
    <div className="space-y-1 pb-4">
      {Array.from({ length: count }).map((_, i) => (
        <motion.button
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
          whileTap={{ scale: 0.98 }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors"
        >
          <div className={cn(
            'w-12 h-12 rounded-2xl flex-shrink-0 bg-gradient-to-br',
            GRADIENTS[i % GRADIENTS.length]
          )} />
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{type} {i + 1}</p>
            <p className="text-xs text-[var(--text-muted)]">Artist · 12 songs</p>
          </div>
        </motion.button>
      ))}
    </div>
  )
}

function ArtistView({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4 pb-4">
      {Array.from({ length: count }).map((_, i) => (
        <motion.button
          key={i}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.04 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex flex-col items-center gap-2"
        >
          <div className={cn(
            'w-full aspect-square rounded-full bg-gradient-to-br border-2 border-[var(--border)]',
            GRADIENTS[i % GRADIENTS.length]
          )} />
          <p className="text-xs font-semibold text-[var(--text-primary)] text-center truncate w-full">
            Artist {i + 1}
          </p>
        </motion.button>
      ))}
    </div>
  )
}