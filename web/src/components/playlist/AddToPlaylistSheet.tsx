import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ListMusic, Plus, Music2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ArtworkImage } from '@/components/ui/ArtworkImage'
import { useToast } from '@/components/ui/Toaster'
import { playlistsApi, getPlaylists } from '@/api/playlists.api'
import { usePlaylistMenuStore } from '@/store/playlistMenu.store'
import { cn } from '@/lib/utils'

/**
 * Add-to-playlist sheet — global, opened via usePlaylistMenuStore.
 *
 * Lists every playlist with a checkmark for membership, lets you toggle
 * a track in/out of a playlist, and has an inline "New playlist" creator
 * that adds the track to the freshly created playlist.
 */
export function AddToPlaylistSheet() {
  const track = usePlaylistMenuStore((s) => s.track)
  const close = usePlaylistMenuStore((s) => s.close)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const { data: playlists } = useQuery({
    queryKey: ['playlists'],
    queryFn: getPlaylists,
    enabled: !!track,
  })

  const open = !!track

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['playlists'] })
    queryClient.invalidateQueries({ queryKey: ['playlist'] })
  }

  const handleToggle = async (playlistId: string, alreadyIn: boolean) => {
    if (!track) return
    setSavingId(playlistId)
    try {
      if (alreadyIn) {
        await playlistsApi.removeTrack(playlistId, track.id)
        toast('Removed from playlist', 'info', 1800)
      } else {
        await playlistsApi.addTrack(playlistId, track.id)
        toast(`Added to playlist`, 'success', 1800)
      }
      refresh()
    } catch {
      toast('Could not update playlist', 'error')
    } finally {
      setSavingId(null)
    }
  }

  const handleCreate = async () => {
    if (!track || !name.trim()) return
    try {
      const pl = await playlistsApi.createPlaylist({ title: name.trim() })
      await playlistsApi.addTrack(pl.id, track.id)
      toast('Playlist created', 'success')
      setName('')
      setCreating(false)
      refresh()
    } catch {
      toast('Could not create playlist', 'error')
    }
  }

  return (
    <Modal open={open} onClose={close} title="Add to playlist" size="md" className="max-h-[80dvh] overflow-hidden flex flex-col">
      {track && (
        <>
          {/* Current track */}
          <div className="flex items-center gap-3 mb-4 flex-shrink-0">
            <ArtworkImage src={track.artworkUrl} alt={track.title} size={48} radius="rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[var(--text-primary)] truncate">{track.title}</p>
              <p className="text-xs text-[var(--text-secondary)] truncate">
                {track.artist?.name ?? 'Unknown Artist'}
              </p>
            </div>
          </div>

          {/* Playlist list */}
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 -my-2 py-2 space-y-0.5">
            {!playlists || playlists.length === 0 ? (
              <p className="text-center text-[13px] text-[var(--text-muted)] py-8">
                No playlists yet — create one below
              </p>
            ) : (
              playlists.map((pl) => {
                const inPlaylist = pl.tracks?.some((t) => t.id === track.id) ?? false
                const busy = savingId === pl.id
                return (
                  <button
                    key={pl.id}
                    disabled={busy}
                    onClick={() => handleToggle(pl.id, inPlaylist)}
                    className={cn(
                      'w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-colors',
                      busy ? 'opacity-50 cursor-wait' : 'hover:bg-[var(--bg-elevated)] active:bg-[var(--bg-elevated)]'
                    )}
                  >
                    {pl.artworkUrl ? (
                      <ArtworkImage src={pl.artworkUrl} alt={pl.title} size={40} radius="rounded-xl" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-800 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Music2 className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--text-primary)] truncate">
                      {pl.title}
                    </span>
                    {inPlaylist && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] flex-shrink-0">
                        <Check className="w-3.5 h-3.5" /> Added
                      </span>
                    )}
                  </button>
                )
              })
            )}

            {/* New playlist */}
            {creating ? (
              <div className="flex items-center gap-2 px-2 py-1.5">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') {
                      setCreating(false)
                      setName('')
                    }
                  }}
                  placeholder="Playlist name…"
                  className="flex-1 h-10 px-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={handleCreate}
                  disabled={!name.trim()}
                  className="h-10 px-4 rounded-xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left text-[var(--accent)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <span className="w-10 h-10 rounded-xl border-2 border-dashed border-[var(--accent-border)] flex items-center justify-center flex-shrink-0">
                  <Plus className="w-4 h-4" />
                </span>
                <span className="text-sm font-bold">New playlist</span>
              </button>
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-2 pt-3 mt-3 border-t border-[var(--border)] flex-shrink-0">
            <ListMusic className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <p className="text-[11px] text-[var(--text-muted)]">
              Tap a playlist to add or remove this song
            </p>
          </div>
        </>
      )}
    </Modal>
  )
}