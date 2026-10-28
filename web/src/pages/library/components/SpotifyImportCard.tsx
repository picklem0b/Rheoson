/**
 * The Spotify import card.
 *
 * This replaced a two-tab "Create / Import" modal that asked for a URL and then
 * went silent for a minute while the backend matched and queued hundreds of
 * songs — leaving no way to tell a slow import from a broken one. Three things
 * make it honest instead:
 *
 *  * a **preview** before anything is queued, including the songs YouTube Music
 *    refused to match, with the reason;
 *  * a **live status** for the import (matching → queueing 42/184 → done),
 *    because the work genuinely takes minutes and pretending otherwise is how
 *    a user reloads mid-import;
 *  * **two destinations, named**: server download (the music folder) and
 *    "keep on this device" (the offline audio cache), which are different
 *    things on a hosted backend and the same thing on Termux.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
   ArrowRight,
   CheckCircle,
   DeviceMobile,
   DownloadSimple,
   ListPlus,
   SpotifyLogo,
   WarningCircle,
   X
} from '@phosphor-icons/react'

import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toaster'
import { playlistsApi } from '@/api/playlists.api'
import { spotifyApi, type CollectionPreview, type SpotifyImportState } from '@/api/spotify.api'
import { invalidatePlaylistSurfaces } from '@/lib/queryInvalidation'
import { keepTracksOnDevice, type DeviceSaveProgress } from '@/lib/deviceLibrary'

const POLL_MS = 1200
const SHOWN_UNMATCHED = 6
const SPOTIFY_LINK = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist)\//i

type Busy = 'preview' | 'download' | 'playlist' | 'device' | null

function kindLabel(kind: string): string {
   switch (kind) {
      case 'playlist':
         return 'Playlist'
      case 'album':
         return 'Album'
      case 'artist':
         return 'Artist top songs'
      case 'track':
         return 'Song'
      default:
         return 'Spotify link'
   }
}

function countLabel(preview: CollectionPreview): string {
   const songs = `${preview.total} ${preview.total === 1 ? 'song' : 'songs'}`
   if (preview.matched === preview.total) return songs
   return `${songs} · ${preview.matched} matched`
}

export function SpotifyImportCard() {
   const queryClient = useQueryClient()
   const { toast } = useToast()

   const [open, setOpen] = useState(true)
   const [url, setUrl] = useState('')
   const [preview, setPreview] = useState<CollectionPreview | null>(null)
   const [previewUrl, setPreviewUrl] = useState('')
   const [busy, setBusy] = useState<Busy>(null)
   const [error, setError] = useState<string | null>(null)
   const [importState, setImportState] = useState<SpotifyImportState | null>(null)
   const [device, setDevice] = useState<DeviceSaveProgress | null>(null)
   const [showUnmatched, setShowUnmatched] = useState(false)

   const mounted = useRef(true)
   const abort = useRef<AbortController | null>(null)

   useEffect(() => {
      mounted.current = true
      return () => {
         mounted.current = false
         abort.current?.abort()
      }
   }, [])

   const looksLikeSpotify = SPOTIFY_LINK.test(url.trim())
   const previewIsCurrent = preview !== null && previewUrl === url.trim()

   const check = useCallback(async () => {
      const link = url.trim()
      if (!link || busy) return
      setBusy('preview')
      setError(null)
      setImportState(null)
      setDevice(null)
      setShowUnmatched(false)
      try {
         const result = await spotifyApi.preview(link)
         if (!mounted.current) return
         setPreview(result)
         setPreviewUrl(link)
         if (result.total === 0) setError('That link has nothing playable in it.')
      } catch (e) {
         if (!mounted.current) return
         setPreview(null)
         setError((e as Error).message || 'Could not read that link')
      } finally {
         if (mounted.current) setBusy(null)
      }
   }, [busy, url])

   const pollImport = useCallback(async (id: string) => {
      // The backend owns the state machine; the client only watches it. A
      // timeout here would be a lie unless it is reported as one, so the loop
      // keeps the last state on screen and stops at a terminal status.
      for (;;) {
         await new Promise(resolve => setTimeout(resolve, POLL_MS))
         if (!mounted.current) return
         try {
            const state = await spotifyApi.getImport(id)
            if (!mounted.current) return
            setImportState(state)
            if (state.status === 'done' || state.status === 'error') {
               if (state.status === 'error') {
                  toast(state.error || 'The import failed', 'error', 5000)
               } else {
                  const extra =
                     state.unmatched.length > 0
                        ? ` · ${state.unmatched.length} left out`
                        : ''
                  toast(
                     `Queued ${state.queued} of ${state.total} songs${extra}`,
                     'success',
                     4500
                  )
               }
               return
            }
         } catch (e) {
            if (!mounted.current) return
            setImportState(prev => (prev ? { ...prev, status: 'error', error: (e as Error).message } : prev))
            return
         }
      }
   }, [toast])

   const download = useCallback(async () => {
      const link = url.trim()
      if (!link || busy) return
      setBusy('download')
      setError(null)
      setDevice(null)
      try {
         const started = await spotifyApi.startImport({ url: link, limit: 200 })
         if (!mounted.current) return
         setImportState(started)
         await pollImport(started.id)
      } catch (e) {
         if (!mounted.current) return
         setError((e as Error).message || 'Could not start the import')
      } finally {
         if (mounted.current) setBusy(null)
      }
   }, [busy, pollImport, url])

   const importAsPlaylist = useCallback(async () => {
      const link = url.trim()
      if (!link || busy || !preview) return
      setBusy('playlist')
      setError(null)
      try {
         await playlistsApi.importSpotify(link)
         invalidatePlaylistSurfaces(queryClient)
         toast(`Added "${preview.title}" to your playlists`, 'success', 4000)
      } catch (e) {
         setError((e as Error).message || 'Could not create the playlist')
      } finally {
         if (mounted.current) setBusy(null)
      }
   }, [busy, preview, queryClient, toast, url])

   const keepOnDevice = useCallback(async () => {
      if (busy || !preview) return
      const ids = preview.tracks.map(track => track.id).filter(Boolean)
      if (ids.length === 0) return
      abort.current?.abort()
      abort.current = new AbortController()
      setBusy('device')
      setError(null)
      setDevice({ done: 0, total: ids.length, saved: 0, failed: 0 })
      try {
         const result = await keepTracksOnDevice(ids, {
            signal: abort.current.signal,
            onProgress: progress => {
               if (mounted.current) setDevice(progress)
            }
         })
         if (!mounted.current) return
         toast(
            result.failed > 0
               ? `Saved ${result.saved} songs on this device · ${result.failed} could not be fetched`
               : `Saved ${result.saved} songs for offline playback`,
            result.failed > 0 ? 'info' : 'success',
            4500
         )
      } finally {
         if (mounted.current) setBusy(null)
      }
   }, [busy, preview, toast])

   if (!open) {
      return (
         <button
            onClick={() => setOpen(true)}
            className='flex w-full items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-left text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]'>
            <SpotifyLogo className='h-4 w-4 text-[var(--accent)]' weight='fill' />
            Import from Spotify
            <ArrowRight className='ml-auto h-4 w-4' />
         </button>
      )
   }

   const importing = importState?.status === 'resolving' || importState?.status === 'queueing'
   const deviceRatio = device && device.total > 0 ? device.done / device.total : 0
   const importRatio =
      importState && importState.matched > 0 ? importState.queued / importState.matched : 0

   return (
      <section className='relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-surface)]'>
         {/* A single accent bloom, not a gradient background: the card has to
             read as part of the library, not as an ad dropped into it. */}
         <div
            aria-hidden
            className='pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl'
            style={{ background: 'var(--accent)' }}
         />

         <div className='relative p-5 sm:p-6'>
            <div className='flex items-start gap-3'>
               <span className='flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)]'>
                  <SpotifyLogo className='h-6 w-6' weight='fill' />
               </span>
               <div className='min-w-0 flex-1'>
                  <h2 className='text-lg font-bold text-[var(--text-primary)]'>
                     Bring a Spotify link in
                  </h2>
                  <p className='mt-0.5 text-sm text-[var(--text-secondary)]'>
                     Song, album, playlist or artist — anything you can copy from Spotify. The songs are
                     matched on YouTube Music and downloaded; Spotify&apos;s own audio is DRM-locked.
                  </p>
               </div>
               <button
                  onClick={() => setOpen(false)}
                  aria-label='Hide the Spotify import'
                  className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'>
                  <X className='h-4 w-4' />
               </button>
            </div>

            <div className='mt-4 flex flex-col gap-2 sm:flex-row'>
               <input
                  value={url}
                  onChange={e => {
                     setUrl(e.target.value)
                     setError(null)
                  }}
                  onKeyDown={e => {
                     if (e.key === 'Enter') void check()
                  }}
                  placeholder='https://open.spotify.com/playlist/…'
                  spellCheck={false}
                  autoCapitalize='none'
                  autoCorrect='off'
                  className='min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]'
               />
               <Button
                  variant='secondary'
                  onClick={() => void check()}
                  loading={busy === 'preview'}
                  disabled={!looksLikeSpotify || busy !== null}
                  className='sm:w-auto'>
                  Check link
               </Button>
            </div>

            {url.trim() !== '' && !looksLikeSpotify && (
               <p className='mt-2 text-xs text-[var(--text-muted)]'>
                  That is not a Spotify link — paste one that starts with open.spotify.com.
               </p>
            )}

            {error && (
               <div className='mt-3 flex items-start gap-2 rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2'>
                  <WarningCircle className='mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--danger)]' weight='fill' />
                  <p className='text-xs text-[var(--danger)]'>{error}</p>
               </div>
            )}

            {preview && previewIsCurrent && (
               <div className='mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3'>
                  <div className='flex items-center gap-3'>
                     {preview.artworkUrl ? (
                        <img
                           src={preview.artworkUrl}
                           alt=''
                           className='h-14 w-14 flex-shrink-0 rounded-xl object-cover'
                        />
                     ) : (
                        <div className='flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--bg-surface)] text-[var(--text-muted)]'>
                           <SpotifyLogo className='h-6 w-6' weight='fill' />
                        </div>
                     )}
                     <div className='min-w-0 flex-1'>
                        <p className='truncate text-sm font-bold text-[var(--text-primary)]'>
                           {preview.title}
                        </p>
                        <p className='mt-0.5 text-xs text-[var(--text-muted)]'>
                           {kindLabel(preview.type)} · {countLabel(preview)}
                           {preview.skipped > 0 && ` · ${preview.skipped} unplayable`}
                        </p>
                     </div>
                  </div>

                  {preview.unmatched.length > 0 && (
                     <div className='mt-3 rounded-xl bg-[var(--bg-surface)] px-3 py-2'>
                        <button
                           onClick={() => setShowUnmatched(v => !v)}
                           className='flex w-full items-center gap-2 text-left text-xs font-semibold text-[var(--warning)]'>
                           <WarningCircle className='h-4 w-4 flex-shrink-0' weight='fill' />
                           {preview.unmatched.length} song{preview.unmatched.length === 1 ? '' : 's'} could
                           not be matched
                           <span className='ml-auto text-[var(--text-muted)]'>
                              {showUnmatched ? 'Hide' : 'Show'}
                           </span>
                        </button>
                        {showUnmatched && (
                           <ul className='mt-2 space-y-1'>
                              {preview.unmatched.slice(0, SHOWN_UNMATCHED).map((item, i) => (
                                 <li
                                    key={`${item.title}-${i}`}
                                    className='flex items-baseline justify-between gap-3 text-[11px]'>
                                    <span className='truncate text-[var(--text-secondary)]'>
                                       {item.title}
                                       {item.artist ? ` — ${item.artist}` : ''}
                                    </span>
                                    <span className='flex-shrink-0 text-[var(--text-muted)]'>
                                       {item.reason}
                                    </span>
                                 </li>
                              ))}
                              {preview.unmatched.length > SHOWN_UNMATCHED && (
                                 <li className='text-[11px] text-[var(--text-muted)]'>
                                    …and {preview.unmatched.length - SHOWN_UNMATCHED} more
                                 </li>
                              )}
                           </ul>
                        )}
                     </div>
                  )}

                  <div className='mt-3 flex flex-wrap items-center gap-2'>
                     <Button
                        variant='primary'
                        size='sm'
                        onClick={() => void download()}
                        loading={busy === 'download'}
                        disabled={busy !== null || preview.matched === 0}>
                        <DownloadSimple className='h-4 w-4' />
                        Download to library
                     </Button>
                     {(preview.type === 'playlist' || preview.type === 'album') && (
                        <Button
                           variant='secondary'
                           size='sm'
                           onClick={() => void importAsPlaylist()}
                           loading={busy === 'playlist'}
                           disabled={busy !== null || preview.matched === 0}>
                           <ListPlus className='h-4 w-4' />
                           Add as playlist
                        </Button>
                     )}
                     <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => void keepOnDevice()}
                        loading={busy === 'device'}
                        disabled={busy !== null || preview.matched === 0}
                        title='Cache the audio on this device so the playlist plays offline'>
                        <DeviceMobile className='h-4 w-4' />
                        Keep on this device
                     </Button>
                  </div>
               </div>
            )}

            {importState && (
               <div className='mt-3 rounded-2xl bg-[var(--bg-elevated)] px-3 py-2.5'>
                  <div className='flex items-center gap-2 text-xs text-[var(--text-secondary)]'>
                     {importState.status === 'done' ? (
                        <CheckCircle className='h-4 w-4 flex-shrink-0 text-[var(--success)]' weight='fill' />
                     ) : importState.status === 'error' ? (
                        <WarningCircle className='h-4 w-4 flex-shrink-0 text-[var(--danger)]' weight='fill' />
                     ) : (
                        <span className='h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent' />
                     )}
                     <span className='font-semibold text-[var(--text-primary)]'>
                        {importState.status === 'resolving' && 'Reading the link on Spotify…'}
                        {importState.status === 'queueing' &&
                           `Matching songs — ${importState.queued} queued of ${importState.matched} matched`}
                        {importState.status === 'done' &&
                           `${importState.queued} queued · ${importState.total} in the link${
                              importState.skippedExisting > 0
                                 ? ` · ${importState.skippedExisting} already downloading`
                                 : ''
                           }`}
                        {importState.status === 'error' && (importState.error || 'Import failed')}
                     </span>
                  </div>
                  {importing && (
                     <div className='mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-surface)]'>
                        <div
                           className='h-full rounded-full bg-[var(--accent)] transition-all'
                           style={{ width: `${Math.max(4, Math.round(importRatio * 100))}%` }}
                        />
                     </div>
                  )}
               </div>
            )}

            {device && (
               <div className='mt-3 rounded-2xl bg-[var(--bg-elevated)] px-3 py-2.5'>
                  <div className='flex items-center justify-between text-xs'>
                     <span className='font-semibold text-[var(--text-primary)]'>
                        Saving on this device — {device.done} of {device.total}
                     </span>
                     <span className='tabular-nums text-[var(--text-muted)]'>
                        {device.saved} saved
                        {device.failed > 0 ? ` · ${device.failed} failed` : ''}
                     </span>
                  </div>
                  <div className='mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-surface)]'>
                     <div
                        className='h-full rounded-full bg-[var(--success)] transition-all'
                        style={{ width: `${Math.round(deviceRatio * 100)}%` }}
                     />
                  </div>
               </div>
            )}
         </div>
      </section>
   )
}
