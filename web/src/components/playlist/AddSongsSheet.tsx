import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MagnifyingGlass, Plus, Check, X } from '@phosphor-icons/react'
import { invalidatePlaylistSurfaces } from '@/lib/queryInvalidation'
import { searchApi } from '@/api/search.api'
import { playlistsApi } from '@/api/playlists.api'
import { recommendationsApi } from '@/api/recommendations.api'
import { tracksApi } from '@/api/tracks.api'
import { normalizeTracks } from '@/lib/normalize'
import { ArtworkImage } from '@/components/ui/ArtworkImage'
import { Modal } from '@/components/ui/Modal'
import { TrackRowSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toaster'
import { truncate } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Track } from '@/types/track.types'

/**
 * Add-songs sheet — opened from a playlist page.
 *
 * Two ways in, no mode switch to learn:
 *   - Suggestions are recommended off the playlist's seed track as soon as
 *     the sheet opens, so one tap adds a fitting song before typing anything.
 *   - Typing searches the catalog; results replace the suggestion list.
 *
 * Songs already in the playlist are labelled "In playlist" and their add
 * button is disabled, so the list states itself instead of failing at tap
 * time.
 */

interface AddSongsSheetProps {
   open: boolean
   playlistId: string
   seedTrackId?: string
   /** Track ids already in the playlist (drives the dupe-aware UI). */
   existingIds: string[]
   onClose: () => void
}

const SEARCH_DEBOUNCE_MS = 350

export function AddSongsSheet({
   open,
   playlistId,
   seedTrackId,
   existingIds,
   onClose,
}: AddSongsSheetProps) {
   const queryClient = useQueryClient()
   const { toast } = useToast()

   const [query, setQuery] = useState('')
   const [results, setResults] = useState<Track[] | null>(null)
   const [searching, setSearching] = useState(false)
   const [suggestions, setSuggestions] = useState<Track[]>([])
   const [suggesting, setSuggesting] = useState(false)
   const [addingId, setAddingId] = useState<string | null>(null)
   const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

   const searchAbort = useRef<AbortController | null>(null)
   const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

   // Reset per open so a previously typed query never bleeds across playlists.
   useEffect(() => {
      if (open) {
         setQuery('')
         setResults(null)
         setSearching(false)
         setAddingId(null)
         setAddedIds(new Set())
      }
   }, [open])

   // Cancel any in-flight search when the sheet closes or unmounts.
   useEffect(
      () => () => {
         searchAbort.current?.abort()
         if (debounceRef.current) clearTimeout(debounceRef.current)
      },
      []
   )

   // Debounced catalog search — one request for the settled phrase.
   useEffect(() => {
      if (!open) return
      const q = query.trim()
      if (debounceRef.current) clearTimeout(debounceRef.current)

      if (!q) {
         searchAbort.current?.abort()
         setResults(null)
         setSearching(false)
         return
      }

      setSearching(true)
      debounceRef.current = setTimeout(async () => {
         searchAbort.current?.abort()
         const ac = new AbortController()
         searchAbort.current = ac
         try {
            const res = await searchApi.search(q, 'tracks', ac.signal)
            if (ac.signal.aborted) return
            setResults(normalizeTracks(res.tracks ?? []).slice(0, 15))
            setSearching(false)
         } catch {
            if (!ac.signal.aborted) setSearching(false)
         }
      }, SEARCH_DEBOUNCE_MS)

      return () => {
         if (debounceRef.current) clearTimeout(debounceRef.current)
      }
   }, [query, open])

   // Suggestions: recommended off the playlist's seed track while idle.
   useEffect(() => {
      if (!open || query.trim() || !seedTrackId) {
         setSuggestions([])
         setSuggesting(false)
         return
      }
      let cancelled = false
      setSuggesting(true)
      ;(async () => {
         try {
            const res = await recommendationsApi.getAutoplay(seedTrackId, 10)
            if (cancelled) return
            const hydrated: Track[] = []
            for (const cand of res.tracks.slice(0, 10)) {
               try {
                  const t = await tracksApi.getTrack(cand.track_id)
                  if (!cancelled && t) hydrated.push(t)
               } catch {
                  // skip ids that can't be hydrated
               }
            }
            if (!cancelled) setSuggestions(hydrated)
         } catch {
            if (!cancelled) setSuggestions([])
         } finally {
            if (!cancelled) setSuggesting(false)
         }
      })()
      return () => {
         cancelled = true
      }
   }, [open, query, seedTrackId])

   const inPlaylist = (id: string) =>
      existingIds.includes(id) || addedIds.has(id)

   const handleAdd = async (track: Track) => {
      if (!playlistId || inPlaylist(track.id) || addingId) return
      setAddingId(track.id)
      try {
         await playlistsApi.addTrack(playlistId, track.id)
         setAddedIds(prev => new Set(prev).add(track.id))
         toast(`Added "${truncate(track.title, 24)}"`, 'success', 1800)
         invalidatePlaylistSurfaces(queryClient)
      } catch {
         toast('Could not add track', 'error')
      } finally {
         setAddingId(null)
      }
   }

   const hasQuery = !!query.trim()
   const rows = hasQuery ? results ?? [] : suggestions
   const loading = hasQuery ? searching : suggesting
   const heading = hasQuery ? 'Search results' : 'Suggested for this playlist'

   return (
      <Modal
         open={open}
         onClose={onClose}
         title='Add songs'
         size='md'
         className='max-h-[80dvh] overflow-hidden flex flex-col'
      >
         {/* Search field */}
         <div className='relative mb-3 flex-shrink-0'>
            <MagnifyingGlass className='absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]' />
            <input
               autoFocus
               value={query}
               onChange={e => setQuery(e.target.value)}
               placeholder='Search songs to add'
               className='w-full h-11 pl-10 pr-9 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]
                  text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                  outline-none focus:border-[var(--accent)] transition-colors'
            />
            {query && (
               <button
                  onClick={() => setQuery('')}
                  aria-label='Clear search'
                  className='absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors'
               >
                  <X className='h-3.5 w-3.5' />
               </button>
            )}
         </div>

         <p className='text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 flex-shrink-0'>
            {heading}
         </p>

         {/* Results / suggestions */}
         <div className='flex-1 min-h-0 overflow-y-auto -mx-6 px-6 -my-2 py-2 space-y-0.5'>
            {loading &&
               Array.from({ length: 5 }).map((_, i) => <TrackRowSkeleton key={i} />)}

            {!loading && hasQuery && results !== null && rows.length === 0 && (
               <p className='py-8 text-center text-[13px] text-[var(--text-muted)]'>
                  No songs found for that search.
               </p>
            )}

            {!loading &&
               rows.map(track => {
                  const added = inPlaylist(track.id)
                  const busy = addingId === track.id
                  return (
                     <div
                        key={track.id}
                        className='flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[var(--bg-elevated)] transition-colors'
                     >
                        <ArtworkImage
                           src={track.artworkUrl}
                           alt={track.title}
                           size={40}
                           radius='rounded-xl'
                        />
                        <div className='flex-1 min-w-0'>
                           <p className='text-sm font-semibold text-[var(--text-primary)] truncate'>
                              {track.title}
                           </p>
                           <p className='text-xs text-[var(--text-secondary)] truncate'>
                              {track.artist?.name ?? 'Unknown Artist'}
                           </p>
                        </div>
                        <button
                           onClick={() => handleAdd(track)}
                           disabled={added || busy || addingId !== null}
                           aria-label={added ? 'Already in playlist' : `Add ${track.title}`}
                           className={cn(
                              'flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-bold flex-shrink-0 transition-all',
                              added
                                 ? 'text-[var(--accent)] bg-[var(--accent-subtle)] cursor-default'
                                 : 'bg-[var(--accent)] text-white disabled:opacity-50'
                           )}
                        >
                           {added ? (
                              <>
                                 <Check className='h-3.5 w-3.5' /> In playlist
                              </>
                           ) : (
                              <>
                                 <Plus className='h-3.5 w-3.5' /> Add
                              </>
                           )}
                        </button>
                     </div>
                  )
               })}

            {!loading && !hasQuery && !seedTrackId && (
               <p className='py-8 text-center text-[13px] text-[var(--text-muted)]'>
                  Type above to find songs for this playlist.
               </p>
            )}
         </div>

         {addedIds.size > 0 && (
            <p className='pt-3 mt-3 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)] flex-shrink-0'>
               {addedIds.size} song{addedIds.size === 1 ? '' : 's'} added — close when
               you&rsquo;re done.
            </p>
         )}
      </Modal>
   )
}
