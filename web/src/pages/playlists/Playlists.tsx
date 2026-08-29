/**
 * Playlists — full page for managing playlists.
 * Create, view, edit, and import playlists.
 * Route: /playlists (registered in router.tsx)
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Music2, Link as LinkIcon, X,
  ChevronRight, ListMusic
} from 'lucide-react'
import { playlistsApi } from '@/api/playlists.api'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconButton } from '@/components/ui/IconButton'
import { useToast } from '@/components/ui/Toaster'
import { formatTotalDuration } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Playlist } from '@/types/playlist.types'

const GRADIENTS = [
  'from-violet-800 to-purple-600',
  'from-rose-800 to-red-600',
  'from-cyan-800 to-blue-600',
  'from-amber-800 to-orange-600',
  'from-emerald-800 to-green-600',
  'from-pink-800 to-rose-600',
  'from-indigo-800 to-violet-600',
  'from-teal-800 to-cyan-600'
]

// ── Create playlist modal ────────────────────────────────────

function CreatePlaylistModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [mode, setMode] = useState<'create' | 'import'>('create')

  const createMutation = useMutation({
    mutationFn: () => playlistsApi.createPlaylist({
      title: title.trim(),
      description: description.trim() || undefined
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      toast('Playlist created!', 'success')
      onClose()
    },
    onError: () => toast('Failed to create playlist', 'error')
  })

  const importMutation = useMutation({
    mutationFn: () => playlistsApi.importSpotify(importUrl.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      toast('Playlist imported!', 'success')
      onClose()
    },
    onError: () => toast('Failed to import playlist', 'error')
  })

  const handleSubmit = () => {
    if (mode === 'create') {
      if (!title.trim()) return
      createMutation.mutate()
    } else {
      if (!importUrl.trim()) return
      importMutation.mutate()
    }
  }

  return (
    <motion.div
      className='absolute inset-0 z-40 flex items-center justify-center'
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className='absolute inset-0 bg-black/60 backdrop-blur-sm' onClick={onClose} />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className='relative z-10 w-[90vw] max-w-md bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] shadow-2xl overflow-hidden'
      >
        {/* Header */}
        <div className='flex items-center justify-between px-6 py-4 border-b border-[var(--border)]'>
          <h2 className='text-lg font-bold text-[var(--text-primary)]'>
            {mode === 'create' ? 'New Playlist' : 'Import Playlist'}
          </h2>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className='w-8 h-8 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center'
          >
            <X className='w-4 h-4 text-[var(--text-muted)]' />
          </motion.button>
        </div>

        {/* Mode switcher */}
        <div className='flex gap-2 px-6 pt-4'>
          {(['create', 'import'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all',
                mode === m
                  ? 'bg-[var(--text-primary)] text-[var(--bg-base)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]'
              )}
            >
              {m === 'create' ? <Plus className='w-3.5 h-3.5' /> : <LinkIcon className='w-3.5 h-3.5' />}
              {m === 'create' ? 'Create' : 'Import'}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className='px-6 py-4 space-y-3'>
          {mode === 'create' ? (
            <>
              <div>
                <label className='text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider'>Title</label>
                <input
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder='My awesome playlist'
                  className='w-full mt-1.5 px-4 py-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]'
                />
              </div>
              <div>
                <label className='text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider'>Description (optional)</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder='A short description...'
                  className='w-full mt-1.5 px-4 py-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]'
                />
              </div>
            </>
          ) : (
            <div>
              <label className='text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider'>Spotify / YouTube URL</label>
              <input
                autoFocus
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder='https://open.spotify.com/playlist/...'
                className='w-full mt-1.5 px-4 py-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]'
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className='flex items-center gap-2 px-6 pb-5'>
          <Button variant='ghost' onClick={onClose} className='flex-1'>
            Cancel
          </Button>
          <Button
            variant='primary'
            onClick={handleSubmit}
            loading={createMutation.isPending || importMutation.isPending}
            disabled={mode === 'create' ? !title.trim() : !importUrl.trim()}
            className='flex-1'
          >
            {mode === 'create' ? 'Create' : 'Import'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Playlist card (grid) ──────────────────────────────────────

function PlaylistCard({ playlist, index, onClick }: {
  playlist: Playlist
  index: number
  onClick: () => void
}) {
  const gradient = GRADIENTS[index % GRADIENTS.length]
  const totalDuration = playlist.tracks?.reduce((acc, t) => acc + (t.duration || 0), 0)

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.04, type: 'spring', damping: 22 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className='text-left group'
    >
      <div className='relative w-full aspect-square rounded-3xl overflow-hidden mb-2.5 shadow-md border border-[var(--border)]'>
        {playlist.artworkUrl ? (
          <img src={playlist.artworkUrl} alt={playlist.title} className='w-full h-full object-cover' />
        ) : (
          <div className={cn('w-full h-full bg-gradient-to-br flex items-center justify-center', gradient)}>
            <Music2 className='w-10 h-10 text-white/30' />
          </div>
        )}
        {/* Play overlay */}
        <div className='absolute inset-0 bg-black/30 opacity-0 group-active:opacity-100 transition-opacity flex items-center justify-center'>
          <div className='w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-xl'>
            <svg className='w-5 h-5 text-black fill-current ml-0.5' viewBox='0 0 24 24'><polygon points='5 3 19 12 5 21 5 3' /></svg>
          </div>
        </div>
      </div>
      <p className='text-sm font-bold text-[var(--text-primary)] truncate leading-tight'>{playlist.title}</p>
      <p className='text-xs text-[var(--text-muted)] truncate mt-0.5 leading-tight'>
        {playlist.trackCount ?? playlist.tracks?.length ?? 0} songs
        {totalDuration ? ` · ${formatTotalDuration(totalDuration)}` : ''}
      </p>
    </motion.button>
  )
}

// ── Playlist row (list) ───────────────────────────────────────

function PlaylistRow({ playlist, index, onClick }: {
  playlist: Playlist
  index: number
  onClick: () => void
}) {
  const gradient = GRADIENTS[index % GRADIENTS.length]

  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.025 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className='w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-[var(--bg-elevated)] transition-colors text-left group'
    >
      <div className={cn(
        'w-14 h-14 rounded-2xl flex-shrink-0 overflow-hidden border border-[var(--border)] flex items-center justify-center',
        !playlist.artworkUrl && `bg-gradient-to-br ${gradient}`
      )}>
        {playlist.artworkUrl ? (
          <img src={playlist.artworkUrl} alt={playlist.title} className='w-full h-full object-cover' />
        ) : (
          <Music2 className='w-6 h-6 text-white/50' />
        )}
      </div>
      <div className='flex-1 min-w-0'>
        <p className='text-sm font-semibold text-[var(--text-primary)] truncate leading-tight'>{playlist.title}</p>
        <p className='text-xs text-[var(--text-muted)] truncate mt-0.5 leading-tight'>
          {playlist.trackCount ?? playlist.tracks?.length ?? 0} songs
        </p>
      </div>
      <ChevronRight className='w-4 h-4 text-[var(--text-muted)] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity' />
    </motion.button>
  )
}

// ── Page ──────────────────────────────────────────────────────

export default function Playlists() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [showCreate, setShowCreate] = useState(false)
  const [grid, setGrid] = useState(true)

  const { data: playlists, isLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: playlistsApi.getPlaylists,
  })

  const _deleteMutation = useMutation({ // eslint-disable-line @typescript-eslint/no-unused-vars
    mutationFn: (id: string) => playlistsApi.deletePlaylist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      toast('Playlist deleted', 'success')
    },
    onError: () => toast('Failed to delete', 'error')
  })

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='px-4 pt-6 pb-3 flex-shrink-0 space-y-4'>
        <div className='flex items-center justify-between'>
          <h1 className='text-2xl font-bold text-[var(--text-primary)]'>Playlists</h1>
          <div className='flex items-center gap-1'>
            <IconButton size='sm' variant='ghost' onClick={() => setGrid(!grid)} title={grid ? 'List view' : 'Grid view'}>
              {grid
                ? <svg className='w-4 h-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><line x1='3' y1='6' x2='21' y2='6' /><line x1='3' y1='12' x2='21' y2='12' /><line x1='3' y1='18' x2='21' y2='18' /></svg>
                : <svg className='w-4 h-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'><rect x='3' y='3' width='7' height='7' rx='1' /><rect x='14' y='3' width='7' height='7' rx='1' /><rect x='3' y='14' width='7' height='7' rx='1' /><rect x='14' y='14' width='7' height='7' rx='1' /></svg>
              }
            </IconButton>
            <IconButton size='sm' variant='accent' onClick={() => setShowCreate(true)} title='New playlist'>
              <Plus />
            </IconButton>
          </div>
        </div>
      </div>

      <ScrollArea className='flex-1 px-4 pb-6'>
        <AnimatePresence mode='wait'>
          <motion.div
            key={grid ? 'grid' : 'list'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {isLoading && (
              <div className={grid
                ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'
                : 'space-y-2'
              }>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i}>
                    {grid
                      ? <Skeleton className='aspect-square rounded-3xl' />
                      : <Skeleton className='h-16 rounded-2xl' />
                    }
                  </div>
                ))}
              </div>
            )}

            {!isLoading && (!playlists || playlists.length === 0) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className='flex flex-col items-center justify-center py-24 gap-4'
              >
                <div className='w-20 h-20 rounded-[2rem] bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--border)]'>
                  <ListMusic className='w-9 h-9 text-[var(--text-muted)]' />
                </div>
                <div className='text-center'>
                  <p className='font-bold text-[var(--text-primary)] text-lg'>No playlists yet</p>
                  <p className='text-[var(--text-muted)] text-sm mt-1'>Create one or import from Spotify</p>
                </div>
                <Button variant='primary' onClick={() => setShowCreate(true)}>
                  <Plus className='w-4 h-4' />
                  New Playlist
                </Button>
              </motion.div>
            )}

            {!isLoading && playlists && playlists.length > 0 && (
              grid ? (
                <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-4'>
                  {playlists.map((pl, i) => (
                    <PlaylistCard
                      key={pl.id}
                      playlist={pl}
                      index={i}
                      onClick={() => navigate(`/playlist/${pl.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <div className='space-y-1 pb-4'>
                  {playlists.map((pl, i) => (
                    <PlaylistRow
                      key={pl.id}
                      playlist={pl}
                      index={i}
                      onClick={() => navigate(`/playlist/${pl.id}`)}
                    />
                  ))}
                </div>
              )
            )}
          </motion.div>
        </AnimatePresence>
      </ScrollArea>

      {/* Create / Import modal */}
      <AnimatePresence>
        {showCreate && <CreatePlaylistModal onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </div>
  )
}
