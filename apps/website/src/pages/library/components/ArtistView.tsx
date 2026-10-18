import { motion } from 'framer-motion'
import { User } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { Artist } from '@/types'

interface ArtistViewProps {
  artists: Artist[]
  onSelect: (id: string) => void
}

export function ArtistView({ artists, onSelect }: ArtistViewProps) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4 pb-4">
      {artists.map((artist, i) => (
        <motion.button
          key={artist.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.04 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSelect(artist.id)}
          className="flex flex-col items-center gap-2"
        >
          <div className={cn(
            'w-full aspect-square rounded-full border border-[var(--border)] overflow-hidden',
            artist.imageUrl ? '' : 'bg-[var(--bg-overlay)]',
          )}>
            {artist.imageUrl
              ? <img src={artist.imageUrl} alt={artist.name} className="w-full h-full object-cover" />
              : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-6 h-6 text-[var(--text-muted)]" weight="duotone" />
                </div>
              )
            }
          </div>
          <p className="text-xs font-semibold text-[var(--text-primary)] text-center truncate w-full">
            {artist.name}
          </p>
        </motion.button>
      ))}
    </div>
  )
}
