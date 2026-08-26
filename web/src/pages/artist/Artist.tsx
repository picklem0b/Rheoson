import { useParams } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play, UserPlus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useQueue } from '@/hooks/queue.hook'
import { getArtist } from '@/api/library.api'
import TopBar from '@/components/layout/TopBar'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { TrackRowSkeleton } from '@/components/ui/Skeleton'
import { formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Track, Album as AlbumType } from '@/types'

const GRADIENTS = [
  'from-rose-900 to-pink-700',
  'from-violet-900 to-indigo-700',
  'from-cyan-900 to-sky-700',
  'from-amber-900 to-yellow-700',
]

export default function Artist() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { playTrack, playAll } = useQueue()

  const { data: artist, isLoading } = useQuery({
    queryKey: ['artist', id],
    queryFn:  () => getArtist(id!),
    enabled:  !!id,
  })

  const gradientIndex = parseInt(id ?? '0') % GRADIENTS.length

  return (
    <div className="flex flex-col h-full">
      <TopBar transparent />
      <ScrollArea className="flex-1">

        {/* ── Hero ──────────────────────────────────────────── */}
        <div className="relative h-64 flex items-end overflow-hidden">
          {artist?.imageUrl
            ? (
              <>
                <img
                  src={artist.imageUrl}
                  alt={artist.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-base)] via-[var(--bg-base)]/40 to-transparent" />
              </>
            ) : (
              <>
                <div className={cn('absolute inset-0 bg-gradient-to-br', GRADIENTS[gradientIndex])} />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-base)] via-transparent to-transparent" />
              </>
            )
          }
          <div className="relative px-4 lg:px-8 pb-6 w-full">
            <h1 className="text-4xl font-bold text-white drop-shadow-lg">
              {artist?.name ?? '—'}
            </h1>
            {artist?.monthlyListeners != null && (
              <p className="text-sm text-white/70 mt-1">
                {artist.monthlyListeners.toLocaleString()} monthly listeners
              </p>
            )}
          </div>
        </div>

        <div className="px-4 lg:px-8 pb-8 space-y-8">

          {/* ── Actions ───────────────────────────────────────── */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              disabled={!artist?.topTracks?.length}
              onClick={() => artist?.topTracks && playAll(artist.topTracks)}
            >
              <Play className="w-5 h-5 fill-current" />
              Play
            </Button>
            <Button variant="secondary" size="md">
              <UserPlus className="w-4 h-4" />
              Follow
            </Button>
          </div>

          {/* ── Popular tracks ────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">Popular</h2>
            <div className="space-y-1">
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => <TrackRowSkeleton key={i} />)
              }
              {(artist?.topTracks ?? []).map((track: Track, i: number) => (
                <PopularTrackRow
                  key={track.id}
                  track={track}
                  index={i}
                  gradient={GRADIENTS[i % GRADIENTS.length]}
                  onClick={() => artist?.topTracks && playTrack(track, artist.topTracks)}
                />
              ))}
            </div>
          </div>

          {/* ── Albums ────────────────────────────────────────── */}
          {(artist?.albums?.length ?? 0) > 0 && (
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">Albums</h2>
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                {(artist?.albums ?? []).map((album: AlbumType, i: number) => (
                  <motion.button
                    key={album.id}
                    whileHover={{ scale: 1.04, y: -3 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => navigate(`/album/${album.id}`)}
                    className="flex-shrink-0 w-36 text-left"
                  >
                    {album.artworkUrl
                      ? (
                        <img
                          src={album.artworkUrl}
                          alt={album.title}
                          className="w-36 h-36 rounded-2xl object-cover border border-[var(--border)] mb-2 shadow-md"
                        />
                      ) : (
                        <div className={cn(
                          'w-36 h-36 rounded-2xl mb-2 bg-gradient-to-br border border-[var(--border)]',
                          GRADIENTS[(i + 2) % GRADIENTS.length],
                        )} />
                      )
                    }
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{album.title}</p>
                    {(album.releaseYear ?? album.year) && (
                      <p className="text-[10px] text-[var(--text-muted)]">{album.releaseYear ?? album.year}</p>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── PopularTrackRow ───────────────────────────────────────────

interface PopularTrackRowProps {
  track:    Track
  index:    number
  gradient: string
  onClick:  () => void
}

function PopularTrackRow({ track, index, gradient, onClick }: PopularTrackRowProps) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
      onClick={onClick}
      className="w-full group flex items-center gap-4 px-3 py-3 rounded-2xl transition-colors text-left"
    >
      <span className="text-sm text-[var(--text-muted)] w-5 text-center group-hover:hidden">
        {index + 1}
      </span>
      <Play className="w-4 h-4 fill-current text-[var(--text-primary)] hidden group-hover:block" />

      {track.artworkUrl
        ? <img src={track.artworkUrl} alt={track.title} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
        : <div className={cn('w-11 h-11 rounded-xl flex-shrink-0 bg-gradient-to-br', gradient)} />
      }

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{track.title}</p>
        {track.playCount != null && (
          <p className="text-xs text-[var(--text-secondary)]">
            {(track.playCount / 1_000_000).toFixed(1)}M plays
          </p>
        )}
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums">
        {formatDuration(track.duration)}
      </span>
    </motion.button>
  )
}
