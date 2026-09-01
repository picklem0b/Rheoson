import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Album, Playlist } from '@/types'

const GRADIENTS = [
  'from-violet-900 to-purple-700',
  'from-rose-900 to-red-700',
  'from-cyan-900 to-blue-700',
  'from-amber-900 to-orange-700',
  'from-emerald-900 to-green-700',
  'from-pink-900 to-rose-700',
]

// ── GridView ──────────────────────────────────────────────────

interface GridViewProps {
  items: (Album | Playlist)[]
  onSelect: (id: string) => void
}

export function GridView({ items, onSelect }: GridViewProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
      {items.map((item, i) => (
        <motion.button
          key={item.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.04 }}
          whileHover={{ scale: 1.03, y: -3 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelect(item.id)}
          className="text-left group"
        >
          <div className={cn(
            'w-full aspect-square rounded-3xl mb-3 relative overflow-hidden',
            'bg-gradient-to-br border border-[var(--border)] shadow-md',
            item.artworkUrl ? '' : GRADIENTS[i % GRADIENTS.length],
          )}>
            {item.artworkUrl
              ? <img src={item.artworkUrl} alt={item.title} className="w-full h-full object-cover" />
              : (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                  <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-xl">
                    <motion.div whileTap={{ scale: 0.9 }}>▶</motion.div>
                  </div>
                </div>
              )
            }
          </div>
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{item.title}</p>
          <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
            {'artist' in item ? (item.artist?.name ?? 'Unknown Artist') : `${item.trackCount ?? 0} songs`}
          </p>
        </motion.button>
      ))}
    </div>
  )
}

// ── ListView ──────────────────────────────────────────────────

interface ListViewProps {
  items: (Album | Playlist)[]
  onSelect: (id: string) => void
}

export function ListView({ items, onSelect }: ListViewProps) {
  return (
    <div className="space-y-1 pb-4">
      {items.map((item, i) => (
        <motion.button
          key={item.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect(item.id)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors"
        >
          {item.artworkUrl
            ? <img src={item.artworkUrl} alt={item.title} className="w-12 h-12 rounded-2xl object-cover flex-shrink-0" />
            : (
              <div className={cn(
                'w-12 h-12 rounded-2xl flex-shrink-0 bg-gradient-to-br',
                GRADIENTS[i % GRADIENTS.length],
              )} />
            )
          }
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {'artist' in item ? (item.artist?.name ?? 'Unknown Artist') : `${item.trackCount ?? 0} songs`}
            </p>
          </div>
        </motion.button>
      ))}
    </div>
  )
}
