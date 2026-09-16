import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, ListMusic, Play, RefreshCw, Trophy, X } from 'lucide-react'
import { searchApi, type CategoryMeta } from '@/api/search.api'
import { useQueue } from '@/hooks/queue.hook'
import { usePrefetchOnIntent } from '@/hooks/prefetchIntent.hook'
import { usePlayerStore } from '@/store/player.store'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Track } from '@/types'

// ── Fallback tiles ────────────────────────────────────────────
// Rendered while the backend list loads (and if it fails), so the browse
// grid is never an empty screen. The backend list is authoritative.

const FALLBACK: CategoryMeta[] = [
   { slug: 'hip-hop',    label: 'Hip-Hop',    emoji: '🎤', gradient: 'from-yellow-900/90 to-orange-800/90',   hero: '2Pac',            heroUrl: 'https://cdn-images.dzcdn.net/images/artist/dc2743d871b5935004292eed2cd55f68/1000x1000-000000-80-0-0.jpg' },
   { slug: 'electronic', label: 'Electronic', emoji: '🎛️', gradient: 'from-cyan-900/90 to-blue-800/90',       hero: 'Daft Punk',       heroUrl: 'https://cdn-images.dzcdn.net/images/artist/638e69b9caaf9f9f3f8826febea7b543/1000x1000-000000-80-0-0.jpg' },
   { slug: 'r-and-b',    label: 'R&B',        emoji: '🎶', gradient: 'from-rose-900/90 to-pink-800/90',       hero: 'Frank Ocean',     heroUrl: 'https://cdn-images.dzcdn.net/images/artist/882155c08dc31d6464d6d580083c968c/1000x1000-000000-80-0-0.jpg' },
   { slug: 'rock',       label: 'Rock',       emoji: '🎸', gradient: 'from-zinc-900/90 to-zinc-700/90',       hero: 'Queen',           heroUrl: 'https://cdn-images.dzcdn.net/images/artist/71eeb9e2eeb375df35a3c0654a5a01ab/1000x1000-000000-80-0-0.jpg' },
   { slug: 'afrobeats',  label: 'Afrobeats',  emoji: '🪘', gradient: 'from-green-900/90 to-emerald-700/90',   hero: 'Burna Boy',       heroUrl: 'https://cdn-images.dzcdn.net/images/artist/ad15b7f03325752d60db9e4d39c079ae/1000x1000-000000-80-0-0.jpg' },
   { slug: 'jazz',       label: 'Jazz',       emoji: '🎷', gradient: 'from-amber-900/90 to-yellow-700/90',    hero: 'Miles Davis',     heroUrl: 'https://cdn-images.dzcdn.net/images/artist/8d13c0527064ba50cf0d0873f4f574dc/1000x1000-000000-80-0-0.jpg' },
   { slug: 'pop',        label: 'Pop',        emoji: '✨', gradient: 'from-violet-900/90 to-purple-700/90',   hero: 'Michael Jackson', heroUrl: 'https://cdn-images.dzcdn.net/images/artist/97fae13b2b30e4aec2e8c9e0c7839d92/1000x1000-000000-80-0-0.jpg' },
   { slug: 'classical',  label: 'Classical',  emoji: '🎻', gradient: 'from-slate-900/90 to-slate-700/90',     hero: 'Beethoven',       heroUrl: 'https://cdn-images.dzcdn.net/images/artist/f16a31a3fe85c5a14debb1f811be1325/1000x1000-000000-80-0-0.jpg' },
   { slug: 'soul',       label: 'Soul',       emoji: '🎙️', gradient: 'from-red-900/90 to-rose-800/90',        hero: 'Aretha Franklin', heroUrl: 'https://cdn-images.dzcdn.net/images/artist/4453648f7e780028c2be766b21474223/1000x1000-000000-80-0-0.jpg' },
   { slug: 'drill',      label: 'Drill',      emoji: '🥁', gradient: 'from-neutral-900/90 to-stone-700/90',   hero: 'Central Cee',     heroUrl: 'https://cdn-images.dzcdn.net/images/artist/25fe719f51af3ee2de27aa267e2a6ac9/1000x1000-000000-80-0-0.jpg' },
]

interface CategoryGridProps {
   /** Optional: run a normal search for the category label. */
   onSelect?: (category: string) => void
}

/**
 * Browse categories, each backed by its own weekly top-5 chart.
 *
 * Tapping a tile expands it in place rather than navigating: the point of the
 * grid is "show me the five best of this genre this week", and making the user
 * leave the page to see that would be a step backwards. The charts themselves
 * are cached server-side per ISO week, so expanding a tile is instant after
 * the first time.
 */
export function CategoryGrid({ onSelect }: CategoryGridProps) {
   const [expanded, setExpanded] = useState<string | null>(null)

   const { data } = useQuery({
      queryKey: ['search', 'categories'],
      queryFn: () => searchApi.getCategories(),
      staleTime: 60 * 60_000,
      retry: 1,
   })

   const categories = data?.categories?.length ? data.categories : FALLBACK
   const week = data?.week

   return (
      <div className="pb-6">
         <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((cat, i) => {
               const isOpen = expanded === cat.slug
               return (
                  <motion.button
                     key={cat.slug}
                     initial={{ opacity: 0, scale: 0.88 }}
                     animate={{ opacity: 1, scale: 1 }}
                     transition={{
                        delay: i * 0.04,
                        type: 'spring',
                        damping: 20,
                        stiffness: 260,
                     }}
                     whileTap={{ scale: 0.95 }}
                     onClick={() =>
                        setExpanded((prev) => (prev === cat.slug ? null : cat.slug))
                     }
                     aria-expanded={isOpen}
                     className={cn(
                        'relative h-[92px] overflow-hidden rounded-2xl bg-gradient-to-br',
                        cat.gradient,
                        'border shadow-md transition-all active:brightness-110',
                        isOpen
                           ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                           : 'border-white/5'
                     )}
                  >
                     {/* Hero portrait — an iconic artist of this genre. The
                         gradient scrim keeps the label readable over any
                         photo; if the image is missing or slow, the genre
                         gradient alone still carries the tile. */}
                     {cat.heroUrl && (
                        <img
                           src={cat.heroUrl}
                           alt=""
                           aria-hidden
                           loading="lazy"
                           decoding="async"
                           className="absolute inset-0 h-full w-full object-cover object-[center_20%] transition-transform duration-500 group-hover:scale-105"
                        />
                     )}
                     <span
                        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
                        aria-hidden
                     />
                     <span className="absolute top-2 left-3 text-[10px] font-bold uppercase tracking-widest text-white/70 drop-shadow">
                        {cat.hero}
                     </span>
                     <span className="absolute bottom-2.5 left-3 text-sm font-bold text-white drop-shadow">
                        {cat.label}
                     </span>
                     <ChevronRight
                        className={cn(
                           'absolute right-3 bottom-2.5 h-3.5 w-3.5 text-white/70 transition-transform',
                           isOpen && 'rotate-90'
                        )}
                     />
                  </motion.button>
               )
            })}
         </div>

         <AnimatePresence>
            {expanded && (
               <CategoryTopSongs
                  key={expanded}
                  slug={expanded}
                  week={week}
                  onSearchAll={onSelect}
                  onClose={() => setExpanded(null)}
               />
            )}
         </AnimatePresence>
      </div>
   )
}

// ── Weekly top 5 for one category ─────────────────────────────

function CategoryTopSongs({
   slug,
   week,
   onSearchAll,
   onClose,
}: {
   slug: string
   week?: string
   onSearchAll?: (category: string) => void
   onClose: () => void
}) {
   const { playTrack, playAll } = useQueue()

   const { data, isLoading, isError, refetch, isFetching } = useQuery({
      queryKey: ['category-top', slug],
      queryFn: () => searchApi.getCategoryTop(slug, 5),
      staleTime: 6 * 60 * 60_000,
      retry: 1,
   })

   const label = data?.category?.label ?? slug
   const tracks: Track[] = data?.tracks ?? []

   return (
      <motion.div
         initial={{ opacity: 0, height: 0 }}
         animate={{ opacity: 1, height: 'auto' }}
         exit={{ opacity: 0, height: 0 }}
         className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]"
      >
         <div className="flex items-center gap-2 border-b border-[var(--border)]/50 px-4 py-3">
            <Trophy className="h-4 w-4 flex-shrink-0 text-[var(--accent)]" />
            <div className="min-w-0 flex-1">
               <p className="text-sm font-bold text-[var(--text-primary)]">
                  Top 5 {label}
                  <span className="ml-1.5 text-[10px] font-semibold tracking-widest text-[var(--text-muted)] uppercase">
                     {week ? `· week ${Number(week.split('-W')[1] ?? 0) || ''}` : 'this week'}
                  </span>
               </p>
               <p className="text-[11px] text-[var(--text-muted)]">
                  Refreshed weekly and cached on the server
               </p>
            </div>

            {tracks.length > 0 && (
               <button
                  onClick={() => playAll(tracks, { shuffle: false })}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-[11px] font-bold text-white"
               >
                  <Play className="h-3 w-3 fill-current" />
                  Play all
               </button>
            )}

            <button
               onClick={() => refetch()}
               disabled={isFetching}
               aria-label="Refresh this category"
               className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
               <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            </button>

            <button
               onClick={onClose}
               aria-label="Close category"
               className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
               <X className="h-4 w-4" />
            </button>
         </div>

         <div className="p-2">
            {isLoading && (
               <div className="space-y-1.5 p-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                     <Skeleton key={i} className="h-14 rounded-xl" />
                  ))}
               </div>
            )}

            {!isLoading && isError && (
               <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">
                  Couldn’t load this category — check your connection.
               </p>
            )}

            {!isLoading && !isError && tracks.length === 0 && (
               <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">
                  No chart available for {label} yet.
               </p>
            )}

            {tracks.map((track, i) => (
               <CategoryTrackRow
                  key={track.id}
                  track={track}
                  position={track.rank || i + 1}
                  onPlay={() => playTrack(track, tracks)}
               />
            ))}

            {onSearchAll && (
               <button
                  onClick={() => onSearchAll(label)}
                  className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--bg-elevated)]"
               >
                  <ListMusic className="h-3.5 w-3.5" />
                  See everything in {label}
               </button>
            )}
         </div>
      </motion.div>
   )
}

function CategoryTrackRow({
   track,
   position,
   onPlay,
}: {
   track: Track
   position: number
   onPlay: () => void
}) {
   const currentTrack = usePlayerStore((s) => s.currentTrack)
   const isPlaying = usePlayerStore((s) => s.isPlaying)
   const intent = usePrefetchOnIntent(track.id)
   const isActive = currentTrack?.id === track.id

   return (
      <motion.button
         initial={{ opacity: 0, x: -6 }}
         animate={{ opacity: 1, x: 0 }}
         transition={{ delay: position * 0.04 }}
         whileTap={{ scale: 0.98 }}
         onClick={onPlay}
         {...intent}
         className={cn(
            'group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors',
            isActive ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--bg-elevated)]'
         )}
      >
         <span
            className={cn(
               'w-5 flex-shrink-0 text-center text-sm font-black tabular-nums',
               isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
            )}
         >
            {position}
         </span>

         <div className="relative h-11 w-11 flex-shrink-0">
            {track.artworkUrl ? (
               <img
                  src={track.artworkUrl}
                  alt={track.title}
                  loading="lazy"
                  decoding="async"
                  className="h-11 w-11 rounded-xl object-cover"
               />
            ) : (
               <div className="h-11 w-11 rounded-xl bg-[var(--bg-elevated)]" />
            )}
            {isActive && isPlaying && (
               <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/45">
                  <div className="flex h-3 items-end gap-[2px]">
                     {[0, 1, 2].map((j) => (
                        <motion.div
                           key={j}
                           className="w-[2px] rounded-full bg-white"
                           animate={{ height: ['40%', '100%', '60%'] }}
                           transition={{
                              duration: 0.7,
                              repeat: Infinity,
                              delay: j * 0.15,
                           }}
                        />
                     ))}
                  </div>
               </div>
            )}
         </div>

         <div className="min-w-0 flex-1">
            <p
               className={cn(
                  'truncate text-sm font-semibold',
                  isActive ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
               )}
            >
               {track.title}
            </p>
            <p className="truncate text-xs text-[var(--text-secondary)]">
               {track.artist?.name ?? 'Unknown Artist'}
            </p>
         </div>

         <span className="flex-shrink-0 text-xs text-[var(--text-muted)] tabular-nums">
            {formatDuration(track.duration)}
         </span>
      </motion.button>
   )
}

// ── ResultSection ─────────────────────────────────────────────

interface ResultSectionProps {
    title: string;
    count: number;
    icon?: React.ReactNode;
    children: React.ReactNode;
}

export function ResultSection({
    title,
    count,
    icon,
    children
}: ResultSectionProps) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                {icon && <span className="text-[var(--accent)]">{icon}</span>}
                <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    {title}
                </h3>
                <span
                    className="text-xs font-semibold text-[var(--text-muted)] bg-[var(--bg-elevated)]
                         px-2 py-0.5 rounded-full tabular-nums"
                >
                    {count}
                </span>
            </div>
            {children}
        </div>
    );
}
