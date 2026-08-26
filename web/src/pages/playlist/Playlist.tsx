import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play, Shuffle, MoreHorizontal, Heart, Download } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useQueue } from '@/hooks/queue.hook'
import { getPlaylist } from '@/api/playlists.api'
import TopBar from '@/components/layout/TopBar'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { TrackRowSkeleton } from '@/components/ui/Skeleton'
import { formatDuration, formatTotalDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Track } from '@/types/track.types'

const GRADIENTS = [
  'from-rose-900 via-rose-800 to-red-900',
  'from-violet-900 via-violet-800 to-purple-900',
  'from-cyan-900 via-cyan-800 to-blue-900',
  'from-amber-900 via-amber-800 to-orange-900',
]

export default function Playlist() {
  const { id } = useParams<{ id: string }>()
  const { playAll, playTrack } = useQueue()

  const { data: playlist, isLoading } = useQuery({
    queryKey: ['playlist', id],
    queryFn:  () => getPlaylist(id!),
    enabled:  !!id,
  })

  const gradientIndex = parseInt(id ?? '0') % GRADIENTS.length

  return (
    <div className="flex flex-col h-full">
      <TopBar transparent />

      <ScrollArea className="flex-1">
        {/* ── Hero ──────────────────────────────────────────── */}
        <div className="relative">
          <div className={cn('absolute inset-0 bg-gradient-to-b opacity-40', GRADIENTS[gradientIndex])} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--bg-base)]" />

          <div className="relative px-4 lg:px-8 pt-4 pb-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 22 }}
              className="flex flex-col sm:flex-row items-start sm:items-end gap-6"
            >
              {playlist?.artworkUrl
                ? (
                  <img
                    src={playlist.artworkUrl}
                    alt={playlist.title}
                    className="w-44 h-44 rounded-3xl shadow-2xl object-cover flex-shrink-0"
                  />
                ) : (
                  <div className={cn(
                    'w-44 h-44 rounded-3xl shadow-2xl flex-shrink-0 bg-gradient-to-br',
                    GRADIENTS[gradientIndex],
                  )} />
                )
              }
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                  Playlist
                </p>
                <h1 className="text-3xl font-bold text-[var(--text-primary)]">
                  {playlist?.title ?? '—'}
                </h1>
                {playlist && (
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    {(playlist.tracks ?? []).length} songs
                    {(playlist.tracks ?? []).length > 0
                      ? ` · ${formatTotalDuration((playlist.tracks ?? []).reduce((acc: number, t: Track) => acc + (t.duration || 0), 0))}`
                      : ''}
                  </p>
                )}
              </div>
            </motion.div>

            <div className="flex items-center gap-3 mt-6">
              <Button
                variant="primary"
                size="lg"
                disabled={!(playlist?.tracks?.length)}
                onClick={() => playlist && playlist.tracks && playAll(playlist.tracks)}
              >
                <Play className="w-5 h-5 fill-current" />
                Play
              </Button>
              <Button
                variant="secondary"
                size="md"
                disabled={!(playlist?.tracks?.length)}
                onClick={() => playlist && playlist.tracks && playAll(playlist.tracks, { shuffle: true })}
              >
                <Shuffle className="w-4 h-4" />
                Shuffle
              </Button>
              <IconButton size="md" variant="ghost"><Heart /></IconButton>
              <IconButton size="md" variant="ghost"><Download /></IconButton>
              <IconButton size="md" variant="ghost"><MoreHorizontal /></IconButton>
            </div>
          </div>
        </div>

        {/* ── Tracks ────────────────────────────────────────── */}
        <div className="px-4 lg:px-8 pb-8 space-y-1">
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => <TrackRowSkeleton key={i} />)
          }
          {(playlist?.tracks ?? []).map((track: Track, i: number) => (
            <PlaylistTrackRow
              key={track.id}
              track={track}
              index={i}
              onClick={() => playlist && playlist.tracks && playTrack(track, playlist.tracks)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── PlaylistTrackRow ──────────────────────────────────────────

interface PlaylistTrackRowProps {
  track:   Track
  index:   number
  onClick: () => void
}

function PlaylistTrackRow({ track, index, onClick }: PlaylistTrackRowProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025 }}
      whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full group flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left"
    >
      <span className="text-sm text-[var(--text-muted)] w-5 text-center tabular-nums group-hover:hidden">
        {index + 1}
      </span>
      <Play className="w-4 h-4 text-[var(--text-primary)] fill-current hidden group-hover:block" />

      {track.artworkUrl
        ? <img src={track.artworkUrl} alt={track.title} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
        : <div className="w-11 h-11 rounded-xl flex-shrink-0 bg-[var(--bg-elevated)]" />
      }

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{track.title}</p>
        <p className="text-xs text-[var(--text-secondary)] truncate">
          {track.artist.name} · {track.album.title}
        </p>
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">
        {formatDuration(track.duration)}
      </span>
    </motion.button>
  )
}
