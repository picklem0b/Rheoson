import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Play, Plus, Sparkles, User, UserPlus, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useQueue } from '@/hooks/queue.hook'
import { useTrackContextMenu } from '@/hooks/useTrackContextMenu'
import { usePrefetchOnIntent } from '@/hooks/prefetchIntent.hook'
import {
  getArtist,
  getFollowStatus,
  followArtist,
  unfollowArtist,
  markReleaseSeen,
  type ArtistRelease,
} from '@/api/library.api'
import { tracksApi } from '@/api/tracks.api'
import TopBar from '@/components/layout/TopBar'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { TrackRowSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toaster'
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
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: artist, isLoading, isError } = useQuery({
    queryKey: ['artist', id],
    queryFn:  () => getArtist(id!),
    enabled:  !!id,
    retry:    1,
  })

  // Follow state (server-side, per user)
  const { data: followStatus } = useQuery({
    queryKey: ['artist-follow', id],
    queryFn:  () => getFollowStatus(id!),
    enabled:  !!id,
    retry:    false,
  })

  const following = !!followStatus?.isFollowing

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!id) return
      if (following) return unfollowArtist(id)
      return followArtist(id, {
        name: artist?.name,
        imageUrl: artist?.imageUrl,
        monthlyListeners: artist?.monthlyListeners,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist-follow', id] })
      queryClient.invalidateQueries({ queryKey: ['following'] })
      toast(
        following ? `Unfollowed ${artist?.name ?? 'artist'}` : `Following ${artist?.name ?? 'artist'} — you'll be told about new releases`,
        following ? 'info' : 'success'
      )
    },
    onError: () => toast('Could not update follow — try again', 'error'),
  })

  const gradientIndex = (id ?? '').length % GRADIENTS.length

  // Top albums for this listener: newest first, albums before singles, capped
  // at five so the rail stays a curated shortlist rather than a discography.
  const topAlbums: AlbumType[] = [...(artist?.albums ?? [])]
    .sort((a, b) => (b.releaseYear ?? b.year ?? 0) - (a.releaseYear ?? a.year ?? 0))
    .slice(0, 5)

  // New-release alert: dismissible, and dismissed once server-side so it
  // doesn't reappear on the next visit.
  const [alertDismissed, setAlertDismissed] = useState(false)
  const release = followStatus?.latestRelease ?? null
  const showReleaseAlert =
    following && !!followStatus?.isNewRelease && !!release && !alertDismissed

  useEffect(() => {
    setAlertDismissed(false)
  }, [id])

  const playRelease = async (rel: ArtistRelease) => {
    try {
      const album = await tracksApi.getTrack(rel.id).catch(() => null)
      if (album) {
        playTrack(album, [album])
        return
      }
    } catch {
      /* fall through to navigating to the album page */
    }
    navigate(`/album/${rel.id}`)
  }

  const dismissRelease = () => {
    setAlertDismissed(true)
    if (id) markReleaseSeen(id).catch(() => {})
  }

  // Not-found state — without this the page renders a bare hero skeleton
  // forever when a browse id doesn't resolve (bad link, delisted artist).
  if (!isLoading && (isError || (!artist || !artist.name || artist.name === 'Unknown Artist'))) {
    return (
      <div className="flex flex-col h-full">
        <TopBar transparent />
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-8">
          <div className="w-20 h-20 rounded-[2rem] bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--border)]">
            <User className="w-8 h-8 text-[var(--text-muted)]" />
          </div>
          <div>
            <p className="font-bold text-[var(--text-primary)]">Artist unavailable</p>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xs">
              This artist page couldn&apos;t be loaded. It may have been removed,
              or the link is out of date.
            </p>
          </div>
          <Button variant="secondary" size="md" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>
      </div>
    )
  }

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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
              {artist?.monthlyListeners != null && artist.monthlyListeners > 0 && (
                <p className="text-sm text-white/75">
                  {artist.monthlyListeners.toLocaleString()} monthly listeners
                </p>
              )}
              {(artist?.genres ?? []).slice(0, 3).map((genre) => (
                <span
                  key={genre}
                  className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/15 text-white/90"
                >
                  {genre}
                </span>
              ))}
            </div>
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

            <Button
              variant={following ? 'secondary' : 'secondary'}
              size="md"
              disabled={followMutation.isPending}
              onClick={() => followMutation.mutate()}
              className={cn(following && 'border-[var(--accent-border)] text-[var(--accent)]')}
            >
              {following
                ? <><Check className="w-4 h-4" /> Following</>
                : <><UserPlus className="w-4 h-4" /> Follow</>
              }
            </Button>
          </div>

          {/* ── New release alert ─────────────────────────────── */}
          <AnimatePresence>
            {showReleaseAlert && release && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="relative flex items-center gap-3 p-3 rounded-2xl bg-[var(--accent-subtle)] border border-[var(--accent-border)] overflow-hidden"
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-[var(--bg-elevated)]">
                  {release.artworkUrl
                    ? <img src={release.artworkUrl} alt={release.title} className="w-full h-full object-cover" />
                    : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
                    <Sparkles className="w-3 h-3" />
                    New {release.type}
                    {release.releaseYear ? ` · ${release.releaseYear}` : ''}
                  </p>
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate mt-0.5">
                    {release.title}
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={() => playRelease(release)}>
                  <Play className="w-4 h-4 fill-current" />
                  Play
                </Button>
                <button
                  onClick={dismissRelease}
                  aria-label="Dismiss new release"
                  className="p-1.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Profile ───────────────────────────────────────── */}
          {artist?.description && (
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">About</h2>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-line">
                {artist.description}
              </p>
            </div>
          )}

          {/* ── Popular tracks ────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">Popular</h2>
            <div className="space-y-1">
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => <TrackRowSkeleton key={i} />)
              }
              {(artist?.topTracks ?? []).slice(0, 10).map((track: Track, i: number) => (
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

          {/* ── Top albums (curated for this listener) ────────── */}
          {topAlbums.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  Top albums for you
                </h2>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {topAlbums.length} of {(artist?.albums?.length ?? 0)}
                </span>
              </div>
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                {topAlbums.map((album, i) => (
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
                          loading="lazy"
                          decoding="async"
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

          {/* ── Singles ───────────────────────────────────────── */}
          {(artist?.singles?.length ?? 0) > 0 && (
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">Singles</h2>
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                {(artist?.singles ?? []).slice(0, 8).map((single, i) => (
                  <motion.button
                    key={single.id}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => navigate(`/album/${single.id}`)}
                    className="flex-shrink-0 w-32 text-left"
                  >
                    {single.artworkUrl
                      ? (
                        <img
                          src={single.artworkUrl}
                          alt={single.title}
                          loading="lazy"
                          decoding="async"
                          className="w-32 h-32 rounded-2xl object-cover border border-[var(--border)] mb-2"
                        />
                      ) : (
                        <div className={cn(
                          'w-32 h-32 rounded-2xl mb-2 bg-gradient-to-br border border-[var(--border)]',
                          GRADIENTS[(i + 1) % GRADIENTS.length],
                        )} />
                      )
                    }
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{single.title}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* ── Related ───────────────────────────────────────── */}
          {(artist?.related?.length ?? 0) > 0 && (
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">Fans also like</h2>
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                {(artist?.related ?? []).slice(0, 8).map((related, i) => (
                  <motion.button
                    key={related.id}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => navigate(`/artist/${related.id}`)}
                    className="flex-shrink-0 w-28 text-center"
                  >
                    <div className="w-28 h-28 rounded-full overflow-hidden mb-2 mx-auto bg-[var(--bg-elevated)] border border-[var(--border)]">
                      {related.imageUrl
                        ? <img src={related.imageUrl} alt={related.name} className="w-full h-full object-cover" />
                        : (
                          <div className={cn(
                            'w-full h-full bg-gradient-to-br',
                            GRADIENTS[i % GRADIENTS.length],
                          )} />
                        )
                      }
                    </div>
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{related.name}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* ── Follow CTA when not following ─────────────────── */}
          {!following && artist?.name && (
            <button
              onClick={() => followMutation.mutate()}
              disabled={followMutation.isPending}
              className="w-full flex items-center gap-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0">
                <Plus className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Follow {artist.name}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Get told about new releases and see them curated into your home page.
                </p>
              </div>
            </button>
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
  const contextMenu = useTrackContextMenu(track)
  const intent = usePrefetchOnIntent(track.id)
  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
      onClick={onClick}
      {...contextMenu}
      {...intent}
      className="w-full group flex items-center gap-4 px-3 py-3 rounded-2xl transition-colors text-left"
    >
      <span className="text-sm text-[var(--text-muted)] w-5 text-center group-hover:hidden">
        {index + 1}
      </span>
      <Play className="w-4 h-4 fill-current text-[var(--text-primary)] hidden group-hover:block" />

      {track.artworkUrl
        ? <img src={track.artworkUrl} alt={track.title} loading="lazy" decoding="async" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
        : <div className={cn('w-11 h-11 rounded-xl flex-shrink-0 bg-gradient-to-br', gradient)} />
      }

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{track.title}</p>
        {track.playCount != null && track.playCount > 0 && (
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
