import { useState } from 'react'
import { motion } from 'framer-motion'
import { Heart, Play, Shuffle, MoreVertical, Music2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useQueue } from '@/hooks/queue.hook'
import { tracksApi } from '@/api/tracks.api'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { TrackRowSkeleton } from '@/components/ui/Skeleton'
import { formatDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Track } from '@/types/track.types'

export default function LikedSongs() {
  const { playAll, playTrack } = useQueue()

  const { data: tracks, isLoading } = useQuery<Track[]>({
    queryKey: ['liked-tracks'],
    queryFn:  () => tracksApi.getLiked(),
  })

  return (
    <div className="flex flex-col h-full">

      {/* ── Hero ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0   }}
        className="flex-shrink-0 px-4 lg:px-8 pt-8 pb-6"
      >
        <div className="flex items-end gap-6">
          <div className="w-28 h-28 lg:w-36 lg:h-36 rounded-3xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shadow-2xl flex-shrink-0">
            <Heart className="w-12 h-12 lg:w-14 lg:h-14 text-white fill-current" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">
              Playlist
            </p>
            <h1 className="text-3xl lg:text-4xl font-bold text-[var(--text-primary)]">
              Liked Songs
            </h1>
            {tracks && (
              <p className="text-sm text-[var(--text-secondary)] mt-2">
                {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <Button
            variant="primary"
            size="lg"
            disabled={!tracks?.length}
            onClick={() => tracks && playAll(tracks)}
          >
            <Play className="w-5 h-5 fill-current" />
            Play all
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={!tracks?.length}
            onClick={() => tracks && playAll(tracks, { shuffle: true })}
          >
            <Shuffle className="w-4 h-4" />
            Shuffle
          </Button>
        </div>
      </motion.div>

      {/* ── Track list ──────────────────────────────────────── */}
      <ScrollArea className="flex-1 px-4 lg:px-8 pb-4">
        <div className="space-y-1">
          {isLoading &&
            Array.from({ length: 10 }).map((_, i) => <TrackRowSkeleton key={i} />)
          }
          {tracks?.map((track, i) => (
            <TrackRow
              key={track.id}
              track={track}
              index={i}
              onClick={() => playTrack(track, tracks)}
            />
          ))}
          {!isLoading && tracks && tracks.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-24 gap-4"
            >
              <div className="w-20 h-20 rounded-[2rem] bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--border)]">
                <Heart className="w-9 h-9 text-[var(--text-muted)]" />
              </div>
              <div className="text-center">
                <p className="font-bold text-[var(--text-primary)] text-lg">No liked songs yet</p>
                <p className="text-[var(--text-muted)] text-sm mt-1">Tap the heart icon on any song to save it here</p>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── TrackRow ──────────────────────────────────────────────────

interface TrackRowProps {
  track:   Track
  index:   number
  onClick: () => void
}

function TrackRow({ track, index, onClick }: TrackRowProps) {
  const queryClient = useQueryClient()

  const handleUnlike = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await tracksApi.unlikeTrack(track.id)
      queryClient.invalidateQueries({ queryKey: ['liked-tracks'] })
      queryClient.invalidateQueries({ queryKey: ['liked-count'] })
    } catch {
      // revert silently
    }
  }

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full group flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left"
    >
      <span className="text-sm text-[var(--text-muted)] w-5 text-center tabular-nums group-hover:hidden">
        {index + 1}
      </span>
      <Play className="w-4 h-4 text-[var(--text-primary)] fill-current hidden group-hover:block w-5 text-center" />

      {track.artworkUrl
        ? <img src={track.artworkUrl} alt={track.title} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
        : <div className="w-11 h-11 rounded-xl flex-shrink-0 bg-[var(--bg-elevated)] flex items-center justify-center">
            <Music2 className="w-4 h-4 text-[var(--text-muted)]" />
          </div>
      }

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{track.title}</p>
        <p className="text-xs text-[var(--text-secondary)] truncate">
          {track.artist.name}
          {track.album?.title ? ` · ${track.album.title}` : ''}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Unlike button — visible on hover */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={handleUnlike}
          className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10"
          aria-label="Unlike"
        >
          <Heart className="w-4 h-4 text-red-400 fill-current" />
        </motion.button>
        <span className="text-xs text-[var(--text-muted)] tabular-nums">
          {formatDuration(track.duration)}
        </span>
      </div>
    </motion.button>
  )
}
