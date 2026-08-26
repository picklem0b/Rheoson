import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play, Shuffle, Heart, Download } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useQueue } from '@/hooks/queue.hook'
import { getAlbum } from '@/api/library.api'
import TopBar from '@/components/layout/TopBar'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { TrackRowSkeleton } from '@/components/ui/Skeleton'
import { formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Track } from '@/types/track.types'

const GRADIENTS = [
  'from-cyan-900 to-blue-700',
  'from-rose-900 to-red-700',
  'from-amber-900 to-orange-700',
  'from-emerald-900 to-green-700',
]

export default function Album() {
  const { id } = useParams<{ id: string }>()
  const { playAll, playTrack } = useQueue()

  const { data: album, isLoading } = useQuery({
    queryKey: ['album', id],
    queryFn:  () => getAlbum(id!),
    enabled:  !!id,
  })

  const gradientIndex = parseInt(id ?? '0') % GRADIENTS.length

  return (
    <div className="flex flex-col h-full">
      <TopBar transparent />
      <ScrollArea className="flex-1">

        {/* ── Hero ──────────────────────────────────────────── */}
        <div className="relative px-4 lg:px-8 pt-4 pb-8">
          <div className={cn('absolute inset-0 bg-gradient-to-b opacity-30', GRADIENTS[gradientIndex])} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--bg-base)]" />

          <div className="relative flex flex-col items-center text-center gap-4 pt-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 20 }}
            >
              {album?.artworkUrl
                ? (
                  <img
                    src={album.artworkUrl}
                    alt={album.title}
                    className="w-52 h-52 rounded-3xl shadow-2xl object-cover"
                  />
                ) : (
                  <div className={cn('w-52 h-52 rounded-3xl shadow-2xl bg-gradient-to-br', GRADIENTS[gradientIndex])} />
                )
              }
            </motion.div>

            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                {album?.title ?? '—'}
              </h1>
              {album && (
                <p className="text-[var(--text-secondary)] text-sm mt-1">
                  {album.artist.name} · {album.releaseYear ?? album.year ?? '—'} · {(album.tracks ?? []).length} songs
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="primary"
                size="md"
                disabled={!(album?.tracks?.length)}
                onClick={() => album && album.tracks && playAll(album.tracks)}
              >
                <Play className="w-4 h-4 fill-current" />
                Play
              </Button>
              <Button
                variant="secondary"
                size="md"
                disabled={!(album?.tracks?.length)}
                onClick={() => album && album.tracks && playAll(album.tracks, { shuffle: true })}
              >
                <Shuffle className="w-4 h-4" />
                Shuffle
              </Button>
              <IconButton size="md" variant="ghost"><Heart /></IconButton>
              <IconButton size="md" variant="ghost"><Download /></IconButton>
            </div>
          </div>
        </div>

        {/* ── Tracks ────────────────────────────────────────── */}
        <div className="px-4 lg:px-8 pb-8 space-y-1">
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => <TrackRowSkeleton key={i} />)
          }
          {(album?.tracks ?? []).map((track: Track, i: number) => (
            <AlbumTrackRow
              key={track.id}
              track={track}
              index={i}
              onClick={() => album && album.tracks && playTrack(track, album.tracks)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── AlbumTrackRow ─────────────────────────────────────────────

interface AlbumTrackRowProps {
  track:   Track
  index:   number
  onClick: () => void
}

function AlbumTrackRow({ track, index, onClick }: AlbumTrackRowProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
      onClick={onClick}
      className="w-full group flex items-center gap-4 px-3 py-3 rounded-2xl transition-colors text-left"
    >
      <span className="text-sm text-[var(--text-muted)] w-5 text-center group-hover:hidden">
        {track.trackNumber ?? index + 1}
      </span>
      <Play className="w-4 h-4 text-[var(--text-primary)] fill-current hidden group-hover:block" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{track.title}</p>
        <p className="text-xs text-[var(--text-secondary)]">{track.artist.name}</p>
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums">
        {formatDuration(track.duration)}
      </span>
    </motion.button>
  )
}
