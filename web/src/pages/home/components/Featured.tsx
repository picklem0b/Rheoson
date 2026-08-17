/**
 * Featured — full-page grid of curated playlists/albums.
 * Lives under pages/home/components because it's only ever reached
 * from Home's "Featured → See all" button.
 *
 * Route: /featured (registered in router.tsx)
 * Backend: GET /api/library/featured (currently returns local playlists;
 *          can be expanded server-side to mix in trending albums later)
 */

import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, Play } from 'lucide-react'
import { libraryApi } from '@/api/library.api'
import TopBar from '@/components/layout/TopBar'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

const GRADIENTS = [
  'from-violet-900 to-purple-700',
  'from-rose-900 to-pink-700',
  'from-cyan-900 to-blue-700',
  'from-amber-900 to-orange-700',
  'from-emerald-900 to-green-700',
  'from-red-900 to-rose-700',
]

// ── Featured card ──────────────────────────────────────────────

function FeaturedCard({ item, index, onClick }: {
  item: { id: string; title: string; subtitle?: string; artworkUrl?: string; type: 'playlist' | 'album' }
  index: number
  onClick: () => void
}) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="text-left group"
    >
      <div className="relative aspect-square rounded-3xl overflow-hidden mb-2.5 shadow-lg">
        {item.artworkUrl
          ? <img src={item.artworkUrl} alt={item.title} className="w-full h-full object-cover" />
          : <div className={cn('w-full h-full bg-gradient-to-br', GRADIENTS[index % GRADIENTS.length])} />
        }
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-lg ml-auto">
            <Play className="w-4 h-4 text-black fill-current ml-0.5" />
          </div>
        </div>
      </div>
      <p className="text-sm font-bold text-[var(--text-primary)] truncate">{item.title}</p>
      {item.subtitle && (
        <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{item.subtitle}</p>
      )}
    </motion.button>
  )
}

// ── Page ──────────────────────────────────────────────────────

export default function Featured() {
  const navigate = useNavigate()

  const { data: items, isLoading } = useQuery({
    queryKey:  ['featured-full'],
    queryFn:   () => libraryApi.getFeatured(50),
    staleTime: 5 * 60_000,
  })

  const hasItems = (items?.length ?? 0) > 0

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Featured" />

      <ScrollArea className="flex-1 px-4 lg:px-8 pb-6">
        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-3xl" />
            ))}
          </div>
        )}

        {!isLoading && !hasItems && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-[var(--bg-elevated)] flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-[var(--text-muted)]" />
            </div>
            <div>
              <p className="font-bold text-[var(--text-primary)]">Nothing featured yet</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Create a playlist to see it featured here
              </p>
            </div>
          </div>
        )}

        {!isLoading && hasItems && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pt-4">
            {items!.map((item, i) => (
              <FeaturedCard
                key={item.id}
                item={item}
                index={i}
                onClick={() => navigate(`/${item.type}/${item.id}`)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}