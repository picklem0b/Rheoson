import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion'
import { Plus, Grid3X3, List, Music2, Disc3, User, Heart } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { IconButton } from '@/components/ui/IconButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { getPlaylists } from '@/api/playlists'
import { getAlbums, getArtists } from '@/api/library'
import { tracksApi } from '@/api/tracks'
import { GridView, ListView } from './components/GridListViews'
import { ArtistView } from './components/ArtistView'
import { cn } from '@/lib/utils'

type LibTab = 'playlists' | 'albums' | 'artists'

const TABS: { id: LibTab; label: string; icon: React.ReactNode }[] = [
  { id: 'playlists', label: 'Playlists', icon: <Music2 className="w-4 h-4" /> },
  { id: 'albums',    label: 'Albums',    icon: <Disc3  className="w-4 h-4" /> },
  { id: 'artists',   label: 'Artists',   icon: <User   className="w-4 h-4" /> },
]

export default function Library() {
  const navigate = useNavigate()
  const [tab,  setTab]  = useState<LibTab>('playlists')
  const [grid, setGrid] = useState(true)

  const { data: playlists, isLoading: loadingPlaylists } = useQuery({
    queryKey: ['playlists'],
    queryFn:  getPlaylists,
  })

  const { data: albums, isLoading: loadingAlbums } = useQuery({
    queryKey: ['library-albums'],
    queryFn:  getAlbums,
    enabled:  tab === 'albums',
  })

  const { data: artists, isLoading: loadingArtists } = useQuery({
    queryKey: ['library-artists'],
    queryFn:  getArtists,
    enabled:  tab === 'artists',
  })

  const { data: likedCount } = useQuery({
    queryKey: ['liked-count'],
    // BUG FIX: was `tracksApi.getLikedCount` (function reference, never called)
    // which made likedCount the function object → rendered as "[object Object]"
    queryFn:  () => tracksApi.getLikedCount(),
  })

  const isLoading =
    (tab === 'playlists' && loadingPlaylists) ||
    (tab === 'albums'    && loadingAlbums)    ||
    (tab === 'artists'   && loadingArtists)

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-4 lg:px-8 pt-6 pb-3 flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Library</h1>
          <div className="flex items-center gap-1">
            <IconButton size="sm" variant="ghost" onClick={() => setGrid(!grid)}>
              {grid ? <List /> : <Grid3X3 />}
            </IconButton>
            <IconButton size="sm" variant="accent" onClick={() => navigate('/library/new')}>
              <Plus />
            </IconButton>
          </div>
        </div>

        <div className="flex gap-2">
          {TABS.map((t) => (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.93 }}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200',
                tab === t.id
                  ? 'bg-[var(--text-primary)] text-[var(--bg-base)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)]',
              )}
            >
              {t.icon}
              {t.label}
            </motion.button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 lg:px-8 pb-4">

        {/* Liked songs pinned card */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/liked')}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-3xl mb-4 mt-2',
            'bg-gradient-to-r from-violet-900/60 to-purple-800/40',
            'border border-violet-500/20 hover:border-violet-500/40 transition-all duration-200',
          )}
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shadow-lg flex-shrink-0">
            <Heart className="w-6 h-6 text-white fill-current" />
          </div>
          <div className="text-left">
            <p className="font-bold text-[var(--text-primary)]">Liked Songs</p>
            <p className="text-sm text-[var(--text-secondary)]">
              {/* likedCount is now a number, not a function or object */}
              {typeof likedCount === 'number' ? `${likedCount} songs` : '—'}
            </p>
          </div>
        </motion.button>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-3xl" />
            ))}
          </div>
        )}

        {!isLoading && tab === 'playlists' && playlists && (
          grid
            ? <GridView items={playlists} onSelect={(id) => navigate(`/playlist/${id}`)} />
            : <ListView items={playlists} onSelect={(id) => navigate(`/playlist/${id}`)} />
        )}

        {!isLoading && tab === 'albums' && albums && (
          grid
            ? <GridView items={albums} onSelect={(id) => navigate(`/album/${id}`)} />
            : <ListView items={albums} onSelect={(id) => navigate(`/album/${id}`)} />
        )}

        {!isLoading && tab === 'artists' && artists && (
          <ArtistView artists={artists} onSelect={(id) => navigate(`/artist/${id}`)} />
        )}
      </ScrollArea>
    </div>
  )
}