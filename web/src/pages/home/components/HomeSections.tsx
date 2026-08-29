import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import { formatDuration } from '@/lib/formatters'
import type { Track } from '@/types/track.types'

// ── QuickPicks ────────────────────────────────────────────────
// Recently played tracks shown as a 2-column grid of pill rows

interface QuickPicksProps {
  tracks:  Track[]
  onPlay:  (track: Track, queue: Track[]) => void
}

export function QuickPicks({ tracks, onPlay }: QuickPicksProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {tracks.map((track, i) => (
        <motion.button
          key={track.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onPlay(track, tracks)}
          className="group flex items-center gap-3 rounded-2xl overflow-hidden bg-[var(--bg-surface)] border border-[var(--border)] pr-3 transition-colors text-left"
        >
          {track.artworkUrl
            ? <img src={track.artworkUrl} alt={track.title} className="w-14 h-14 object-cover flex-shrink-0" />
            : <div className="w-14 h-14 bg-[var(--bg-elevated)] flex-shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{track.title}</p>
            <p className="text-xs text-[var(--text-secondary)] truncate">{track.artist.name}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" />
          </div>
        </motion.button>
      ))}
    </div>
  )
}

// ── FeaturedSection ───────────────────────────────────────────
// Large horizontal scroll of featured playlists / albums

interface FeaturedItem {
  id:         string
  title:      string
  subtitle?:  string
  artworkUrl?: string
  type:       'playlist' | 'album'
}

interface FeaturedSectionProps {
  items: FeaturedItem[]
}

export function FeaturedSection({ items }: FeaturedSectionProps) {
  const navigate = useNavigate()

  return (
    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 lg:-mx-8 lg:px-8">
      {items.map((item, i) => (
        <motion.button
          key={item.id}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.06 }}
          whileHover={{ scale: 1.03, y: -2 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate(`/${item.type}/${item.id}`)}
          className="flex-shrink-0 w-44 text-left"
        >
          {item.artworkUrl
            ? (
              <img
                src={item.artworkUrl}
                alt={item.title}
                className="w-44 h-44 rounded-3xl object-cover border border-[var(--border)] shadow-md mb-2"
              />
            ) : (
              <div className="w-44 h-44 rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-md mb-2" />
            )
          }
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{item.title}</p>
          {item.subtitle && (
            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{item.subtitle}</p>
          )}
        </motion.button>
      ))}
    </div>
  )
}

// ── TrendingRow ───────────────────────────────────────────────
// Compact numbered list of trending tracks

interface TrendingRowProps {
  tracks: Track[]
  onPlay: (track: Track, queue: Track[]) => void
}

export function TrendingRow({ tracks, onPlay }: TrendingRowProps) {
  return (
    <div className="space-y-1">
      {tracks.map((track, i) => (
        <motion.button
          key={track.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onPlay(track, tracks)}
          className="w-full group flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left"
        >
          <span className="text-sm tabular-nums text-[var(--text-muted)] w-5 text-center group-hover:hidden">
            {i + 1}
          </span>
          <Play className="w-4 h-4 fill-current text-[var(--text-primary)] hidden group-hover:block flex-shrink-0" />

          {track.artworkUrl
            ? <img src={track.artworkUrl} alt={track.title} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
            : <div className="w-11 h-11 rounded-xl bg-[var(--bg-elevated)] flex-shrink-0" />
          }

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{track.title}</p>
            <p className="text-xs text-[var(--text-secondary)] truncate">{track.artist.name}</p>
          </div>
          <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">
            {formatDuration(track.duration)}
          </span>
        </motion.button>
      ))}
    </div>
  )
}
