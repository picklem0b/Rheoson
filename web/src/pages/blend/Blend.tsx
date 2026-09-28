import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
   ArrowLeft,
   DotsThree,
   Pencil,
   Play,
   Shuffle,
   Trash,
   UserPlus,
   Users,
   X,
   MusicNote,
} from '@phosphor-icons/react'
import { blendsApi, type Blend } from '@/api/blends.api'
import { tracksApi } from '@/api/tracks.api'
import { messagesApi, type PeerInfo } from '@/api/messages.api'
import { qk } from '@/lib/queryKeys'
import { useAuthStore } from '@/store/auth.store'
import { useQueue } from '@/hooks/queue.hook'
import { ArtworkImage } from '@/components/ui/ArtworkImage'
import { useToast } from '@/components/ui/Toaster'
import { Skeleton } from '@/components/ui/Skeleton'
import { splitErrorCode } from '@/api/client.api'
import type { Track } from '@/types/track.types'

/**
 * Batch profile lookup for member lists.
 *
 * One POST /messages/profiles per member set; a member-list query just
 * maps ids → profiles. Unknown/deleted ids degrade to a placeholder on
 * the server, so this never fails the page.
 */
function useProfiles(userIds: string[] | undefined) {
   const key = (userIds ?? []).join(',')
   return useQuery({
      queryKey: ['messaging-profiles', key],
      queryFn: () => messagesApi.getProfiles(key.split(',').filter(Boolean)),
      enabled: key.length > 0,
      staleTime: 5 * 60_000,
   })
}

/**
 * Blend detail — a playlist owned by everyone in it.
 *
 * Every member sees the same page: rename, add/remove tracks, invite or
 * remove friends. Only the owner gets delete. Track ids hydrate through
 * tracksApi.getTrack exactly like playlist suggestions do.
 */

export default function Blend() {
   const { id } = useParams<{ id: string }>()
   const navigate = useNavigate()
   const queryClient = useQueryClient()
   const { toast } = useToast()
   const meId = useAuthStore((s) => s.user?.id ?? '')
   const { playTrack } = useQueue()

   const [menuOpen, setMenuOpen] = useState(false)
   const menuRef = useRef<HTMLDivElement>(null)

   useEffect(() => {
      if (!menuOpen) return
      const handler = (e: MouseEvent) => {
         if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
   }, [menuOpen])

   const { data: blend, isLoading, error } = useQuery({
      queryKey: qk.blend(id!),
      queryFn: () => blendsApi.get(id!),
      enabled: !!id,
      retry: false,
   })

   // Hooks before any early return — blend may be undefined while loading.
   const { data: profiles } = useProfiles(blend?.members)

   const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: qk.blend(id!) })
      void queryClient.invalidateQueries({ queryKey: qk.blends() })
   }

   const failToast = (err: unknown) => {
      const raw = err instanceof Error ? err.message : 'Something went wrong'
      const { message, code } = splitErrorCode(raw)
      toast(code ? `${message} — ${code}` : message, 'error', 5000)
   }

   const hydrate = async (ids: string[]): Promise<Track[]> => {
      const tracks: Track[] = []
      for (const tid of ids) {
         try {
            const t = await tracksApi.getTrack(tid)
            if (t) tracks.push(t)
         } catch { /* a dead id must not kill the page */ }
      }
      return tracks
   }

   const { data: tracks = [], isLoading: loadingTracks } = useQuery({
      queryKey: ['blend-tracks', blend?.tracks.join(',')],
      queryFn: () => hydrate(blend?.tracks ?? []),
      enabled: !!blend,
      staleTime: 60_000,
   })

   const rename = useMutation({
      mutationFn: (name: string) => blendsApi.rename(id!, name),
      onSuccess: refresh,
      onError: failToast,
   })

   const remove = useMutation({
      mutationFn: () => blendsApi.remove(id!),
      onSuccess: () => {
         refresh()
         toast('Blend deleted', 'success', 2500)
         navigate('/library')
      },
      onError: failToast,
   })

   const removeTrack = useMutation({
      mutationFn: (trackId: string) => blendsApi.removeTrack(id!, trackId),
      onSuccess: refresh,
      onError: failToast,
   })

   const [showRename, setShowRename] = useState(false)
   const [nameDraft, setNameDraft] = useState('')
   const [showMembers, setShowMembers] = useState(false)

   if (isLoading) {
      return (
         <div className='p-6 space-y-4'>
            <Skeleton className='h-8 w-40' />
            <Skeleton className='h-44 w-44 rounded-3xl' />
            <Skeleton className='h-4 w-2/3' />
            <Skeleton className='h-4 w-1/3' />
         </div>
      )
   }

   if (error || !blend) {
      return (
         <div className='flex flex-col items-center justify-center py-24 gap-3 text-center px-6'>
            <Users className='w-12 h-12 text-[var(--text-muted)]' />
            <p className='font-semibold text-[var(--text-secondary)]'>Blend not found</p>
            <p className='text-sm text-[var(--text-muted)]'>It may have been deleted by the owner.</p>
            <button
               onClick={() => navigate('/library')}
               className='mt-2 px-4 h-10 rounded-2xl bg-[var(--accent)] text-white text-sm font-semibold'>
               Back to Library
            </button>
         </div>
      )
   }

   const isOwner = blend.owner === meId

   return (
      <div className='pb-8'>
         {/* Top bar */}
         <div className='flex items-center justify-between px-4 lg:px-8 pt-4'>
            <button
               onClick={() => navigate(-1)}
               aria-label='Go back'
               className='w-9 h-9 rounded-full flex items-center justify-center
                          text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors'>
               <ArrowLeft className='w-5 h-5' />
            </button>
            <div className='relative' ref={menuRef}>
               <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label='Blend options'
                  aria-expanded={menuOpen}
                  className='w-9 h-9 rounded-full flex items-center justify-center
                             text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors'>
                  <DotsThree className='w-5 h-5' weight='bold' />
                </button>
               {menuOpen && (
                  <div className='absolute right-0 top-11 z-20 w-48 rounded-2xl border border-[var(--border)]
                                  bg-[var(--bg-surface)] shadow-[var(--shadow-lg)] overflow-hidden'>
                     <button
                        onClick={() => {
                           setNameDraft(blend.name)
                           setShowRename(true)
                           setMenuOpen(false)
                        }}
                        className='w-full flex items-center gap-2.5 px-4 py-2.5 text-sm
                                   text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors'>
                        <Pencil className='w-4 h-4' /> Rename blend
                     </button>
                     {isOwner && (
                        <button
                           onClick={() => {
                              setMenuOpen(false)
                              remove.mutate()
                           }}
                           className='w-full flex items-center gap-2.5 px-4 py-2.5 text-sm
                                      text-[var(--danger)] hover:bg-[var(--bg-elevated)] transition-colors'>
                           <Trash className='w-4 h-4' /> Delete blend
                        </button>
                     )}
                  </div>
               )}
            </div>
         </div>

         {/* Header */}
         <div className='px-4 lg:px-8 pt-4 pb-6'>
            <div className='flex flex-col sm:flex-row items-start sm:items-end gap-6'>
               <div className='w-40 h-40 rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-rose-500
                               shadow-[var(--shadow-glow)] flex items-center justify-center flex-shrink-0'>
                  <Users className='w-14 h-14 text-white' weight='duotone' />
               </div>
               <div className='min-w-0'>
                  <p className='text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1'>
                     Blend
                  </p>
                  <h1 className='text-3xl font-black text-[var(--text-primary)] tracking-tight break-words'>
                     {blend.name}
                  </h1>
                  <button
                     onClick={() => setShowMembers(true)}
                     className='mt-2 flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors'>
                     <Users className='w-4 h-4' />
                     {blend.members.length} {blend.members.length === 1 ? 'member' : 'members'}
                  </button>
               </div>
            </div>

            {/* Actions */}
            <div className='flex items-center gap-3 mt-6'>
               <button
                  onClick={() => tracks[0] && playTrack(tracks[0], tracks)}
                  disabled={tracks.length === 0}
                  aria-label='Play blend'
                  className='w-12 h-12 rounded-full bg-[var(--accent)] text-white flex items-center justify-center
                             disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all'>
                  <Play className='w-5 h-5' weight='fill' />
               </button>
               <button
                  onClick={() => tracks[0] && playTrack(tracks[0], tracks)}
                  disabled={tracks.length === 0}
                  aria-label='Shuffle blend'
                  className='w-12 h-12 rounded-full border border-[var(--border)] flex items-center justify-center
                             text-[var(--text-secondary)] disabled:opacity-40
                             hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors'>
                  <Shuffle className='w-5 h-5' />
               </button>
            </div>
         </div>

         {/* Tracks */}
         <div className='px-2 lg:px-6'>
            {loadingTracks ? (
               <div className='space-y-2'>
                  {[0, 1, 2].map((i) => <Skeleton key={i} className='h-14 rounded-2xl' />)}
               </div>
            ) : tracks.length === 0 ? (
               <div className='flex flex-col items-center justify-center py-14 gap-3 text-center'>
                  <MusicNote className='w-10 h-10 text-[var(--text-muted)]' />
                  <p className='text-sm text-[var(--text-muted)]'>
                     Empty blend — add songs from any track&apos;s menu.
                  </p>
               </div>
            ) : (
               tracks.map((t, i) => (
                  <motion.div
                     key={t.id}
                     initial={{ opacity: 0, y: 6 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ delay: Math.min(i * 0.02, 0.3) }}
                     className='group flex items-center gap-3 px-2.5 py-2 rounded-2xl hover:bg-[var(--bg-elevated)] transition-colors'>
                     <button
                        onClick={() => playTrack(t, tracks)}
                        className='relative w-11 h-11 flex-shrink-0 rounded-xl overflow-hidden'>
                        <ArtworkImage src={t.artworkUrl} alt='' className='w-full h-full' radius='rounded-none' />
                        <span className='absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40'>
                           <Play className='w-4 h-4 text-white' weight='fill' />
                        </span>
                     </button>
                     <div className='min-w-0 flex-1'>
                        <p className='text-sm font-medium text-[var(--text-primary)] truncate'>{t.title}</p>
                        <p className='text-xs text-[var(--text-muted)] truncate'>{t.artist?.name}</p>
                     </div>
                     <button
                        onClick={() => removeTrack.mutate(t.id)}
                        aria-label={`Remove ${t.title} from blend`}
                        className='w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100
                                   text-[var(--text-muted)] hover:text-[var(--danger)] transition-all'>
                        <X className='w-4 h-4' />
                     </button>
                  </motion.div>
               ))
            )}
         </div>

         {/* Rename dialog */}
         {showRename && (
            <div className='fixed inset-0 z-[95] flex items-center justify-center'>
               <div className='absolute inset-0 bg-black/60 backdrop-blur-sm' onClick={() => setShowRename(false)} />
               <div className='relative z-10 w-full sm:max-w-sm mx-4 rounded-3xl bg-[var(--bg-surface)]
                               border border-[var(--border)] p-5 space-y-4'>
                  <h2 className='text-lg font-bold text-[var(--text-primary)]'>Rename blend</h2>
                  <input
                     autoFocus
                     value={nameDraft}
                     maxLength={80}
                     onChange={(e) => setNameDraft(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter' && nameDraft.trim()) {
                           rename.mutate(nameDraft.trim())
                           setShowRename(false)
                        }
                     }}
                     aria-label='Blend name'
                     className='w-full h-11 px-4 rounded-2xl bg-[var(--bg-elevated)] text-sm
                                text-[var(--text-primary)] outline-none focus:ring-2 ring-[var(--accent)]'
                  />
                  <div className='flex gap-2 justify-end'>
                     <button
                        onClick={() => setShowRename(false)}
                        className='px-4 h-10 rounded-2xl text-sm text-[var(--text-secondary)]
                                   hover:bg-[var(--bg-elevated)] transition-colors'>
                        Cancel
                     </button>
                     <button
                        onClick={() => {
                           if (nameDraft.trim()) {
                              rename.mutate(nameDraft.trim())
                              setShowRename(false)
                           }
                        }}
                        className='px-4 h-10 rounded-2xl bg-[var(--accent)] text-white text-sm font-semibold'>
                        Save
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Members sheet */}
         {showMembers && (
            <MembersSheet
               blend={blend}
               meId={meId}
               profiles={profiles ?? undefined}
               onClose={() => setShowMembers(false)}
               onChanged={refresh}
            />
         )}
      </div>
   )
}

// ── Members management ────────────────────────────────────────

function MembersSheet({
   blend,
   meId,
   profiles,
   onClose,
   onChanged
}: {
   blend: Blend
   meId: string
   profiles?: PeerInfo[]
   onClose: () => void
   onChanged: () => void
}) {
   const byId = new Map((profiles ?? []).map((p) => [p.id, p]))
   const { toast } = useToast()
   const [userDraft, setUserDraft] = useState('')

   const { data: found = [] } = useQuery({
      queryKey: qk.messagingUsers(userDraft),
      queryFn: () => messagesApi.searchUsers(userDraft, 8),
      enabled: userDraft.trim().length > 0,
      staleTime: 15_000,
   })

   const failToast = (err: unknown) => {
      const raw = err instanceof Error ? err.message : 'Something went wrong'
      const { message, code } = splitErrorCode(raw)
      toast(code ? `${message} — ${code}` : message, 'error', 5000)
   }

   const invite = async (userId: string) => {
      try {
         await blendsApi.addMember(blend.id, userId)
         onChanged()
      } catch (err) {
         failToast(err)
      }
   }

   const kick = async (userId: string) => {
      try {
         await blendsApi.removeMember(blend.id, userId)
         onChanged()
      } catch (err) {
         failToast(err)
      }
   }

   const isOwner = blend.owner === meId

   return (
      <div className='fixed inset-0 z-[95] flex items-end sm:items-center justify-center'>
         <div className='absolute inset-0 bg-black/60 backdrop-blur-sm' onClick={onClose} />
         <div className='relative z-10 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[var(--bg-surface)]
                         border border-[var(--border)] overflow-hidden'>
            <div className='px-5 py-4 border-b border-[var(--border)] flex items-center justify-between'>
               <h2 className='text-base font-bold text-[var(--text-primary)]'>Members</h2>
               <button onClick={onClose} aria-label='Close members'
                       className='w-8 h-8 rounded-full flex items-center justify-center
                                  text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'>
                  <X className='w-4 h-4' />
               </button>
            </div>

            {/* Add by username */}
            <div className='px-5 pt-4'>
               <div className='relative'>
                  <UserPlus className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]' />
                  <input
                     value={userDraft}
                     onChange={(e) => setUserDraft(e.target.value)}
                     placeholder='Add by username…'
                     aria-label='Add member by username'
                     className='w-full h-10 pl-9 pr-3 rounded-2xl bg-[var(--bg-elevated)] text-sm
                                text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                                outline-none focus:ring-2 ring-[var(--accent)]'
                  />
               </div>
            </div>

            <div className='px-2 py-2 max-h-64 overflow-y-auto'>
               {/* Current members — real names/avatars via the batch endpoint */}
               {blend.members.map((m) => {
                  const p = byId.get(m)
                  const name = p?.username ?? m
                  return (
                  <div key={m} className='flex items-center gap-3 px-3 py-2'>
                     {p?.image_url ? (
                        <img src={p.image_url} alt='' className='w-9 h-9 rounded-full object-cover' />
                     ) : (
                        <span className='w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500
                                         flex items-center justify-center text-xs font-bold text-white'>
                           {name.slice(0, 2).toUpperCase()}
                        </span>
                     )}
                     <span className='text-sm text-[var(--text-primary)] truncate flex-1'>
                        {m === blend.owner ? `${name} (owner)` : name}
                     </span>
                     {isOwner && m !== blend.owner && (
                        <button
                           onClick={() => void kick(m)}
                           aria-label={`Remove member ${m}`}
                           className='w-8 h-8 rounded-full flex items-center justify-center
                                      text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors'>
                           <X className='w-4 h-4' />
                        </button>
                     )}
                     {!isOwner && m === meId && (
                        <button
                           onClick={() => void kick(m)}
                           className='text-xs text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors px-2'>
                           Leave
                        </button>
                     )}
                  </div>
                  )
               })}

               {/* Search results (filtered to non-members) */}
               {userDraft.trim() && found
                  .filter((u) => !blend.members.includes(u.id))
                  .map((u) => (
                     <button
                        key={u.id}
                        onClick={() => void invite(u.id)}
                        className='w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg-elevated)] transition-colors text-left'>
                        {u.image_url ? (
                           <img src={u.image_url} alt='' className='w-9 h-9 rounded-full object-cover' />
                        ) : (
                           <span className='w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500
                                            flex items-center justify-center text-xs font-bold text-white'>
                              {u.username.slice(0, 2).toUpperCase()}
                           </span>
                        )}
                        <span className='text-sm text-[var(--text-primary)] truncate flex-1'>{u.username}</span>
                        <UserPlus className='w-4 h-4 text-[var(--accent)]' />
                     </button>
                  ))}
            </div>
         </div>
      </div>
   )
}
