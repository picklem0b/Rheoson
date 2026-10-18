import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MagnifyingGlass, CheckCircle } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useShareStore } from '@/store/share.store'
import { useAuthStore } from '@/store/auth.store'
import { messagesApi, type PeerInfo } from '@/api/messages.api'
import { qk } from '@/lib/queryKeys'
import { useToast } from '@/components/ui/Toaster'
import { splitErrorCode } from '@/api/client.api'
import { cn } from '@/lib/utils'

/**
 * ShareToChatModal — the one dialog for sending anything to a friend.
 *
 * Opened via useShareStore().openShare({ kind, id, title, … }). Lists
 * users (prefix search + presence-first ordering), lets the sender add an
 * optional note, and POSTs through messagesApi — the same service the
 * socket path uses, so rate-limit (MLM01) and validation codes flow back
 * into the toast with their [ERROR_CODE: …] chips intact.
 */

const MAX_NOTE = 300

export default function ShareToChatModal() {
   const open = useShareStore((s) => s.open)
   const payload = useShareStore((s) => s.payload)
   const closeShare = useShareStore((s) => s.closeShare)
   const meId = useAuthStore((s) => s.user?.id ?? null)
   const { toast } = useToast()

   const [query, setQuery] = useState('')
   const [selected, setSelected] = useState<PeerInfo | null>(null)
   const [note, setNote] = useState('')
   const [sending, setSending] = useState(false)
   const [sent, setSent] = useState(false)
   const inputRef = useRef<HTMLInputElement>(null)

   useEffect(() => {
      if (open) {
         setQuery('')
         setSelected(null)
         setNote('')
         setSending(false)
         setSent(false)
         window.setTimeout(() => inputRef.current?.focus(), 80)
      }
   }, [open])

   const { data: users = [] } = useQuery({
      queryKey: qk.messagingUsers(query),
      queryFn: () => messagesApi.searchUsers(query, 12),
      enabled: open,
      staleTime: 15_000,
   })

   const ordered = useMemo(() => {
      // Not-yet-followed presence ordering is server-side; here just keep
      // the picker stable and let the search box filter client-side too.
      const q = query.trim().toLowerCase()
      const list = q ? users.filter((u) => u.username.toLowerCase().includes(q)) : users
      return list
   }, [users, query])

   const send = async () => {
      if (!payload || !selected || sending) return
      setSending(true)
      try {
         await messagesApi.send({
            peerId: selected.id,
            kind: payload.kind,
            text: note.trim() || undefined,
            payload: {
               [`${payload.kind}Id`]: payload.id,
               title: payload.title,
               subtitle: payload.subtitle,
               artworkUrl: payload.artworkUrl,
               snippet: payload.snippet,
            },
         })
         setSent(true)
         toast(`Shared with ${selected.username}`, 'success', 2200)
         window.setTimeout(closeShare, 650)
      } catch (err) {
         const raw = err instanceof Error ? err.message : 'Could not share this right now'
         const { message, code } = splitErrorCode(raw)
         toast(code ? `${message} — ${code}` : message, 'error', 5000)
      } finally {
         setSending(false)
      }
   }

   return (
      <AnimatePresence>
         {open && payload && (
            <motion.div
               className='fixed inset-0 z-[95] flex items-end sm:items-center justify-center'
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}>
               <div
                  className='absolute inset-0 bg-black/60 backdrop-blur-sm'
                  onClick={sending ? undefined : closeShare}
                  aria-hidden='true'
               />
               <motion.div
                  role='dialog'
                  aria-modal='true'
                  aria-label='Share with a friend'
                  initial={{ y: 60, opacity: 0, scale: 0.98 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: 60, opacity: 0, scale: 0.98 }}
                  transition={{ type: 'spring', damping: 30, stiffness: 340 }}
                  className='relative z-10 w-full sm:max-w-md bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-3xl
                             border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden'>
                  {/* Header */}
                  <div className='flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]'>
                     <div className='min-w-0 flex-1'>
                        <p className='text-sm font-semibold text-[var(--text-primary)]'>
                           {sent ? 'Shared' : 'Share to chat'}
                        </p>
                        <p className='text-xs text-[var(--text-muted)] truncate'>
                           {payload.title}
                        </p>
                     </div>
                     <button
                        onClick={closeShare}
                        disabled={sending}
                        aria-label='Close share dialog'
                        className='w-8 h-8 rounded-full flex items-center justify-center
                                   text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors'>
                        <X className='w-4 h-4' />
                     </button>
                  </div>

                  {sent ? (
                     <div className='py-12 flex flex-col items-center gap-3'>
                        <CheckCircle className='w-12 h-12 text-[var(--success)]' weight='fill' />
                        <p className='text-sm text-[var(--text-secondary)]'>
                           On its way to {selected?.username}
                        </p>
                     </div>
                  ) : (
                     <>
                        {/* Search / pick a friend */}
                        <div className='px-5 pt-4'>
                           <div className='relative'>
                              <MagnifyingGlass className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]' />
                              <input
                                 ref={inputRef}
                                 value={query}
                                 onChange={(e) => setQuery(e.target.value)}
                                 placeholder='Find a friend…'
                                 aria-label='Search friends by username'
                                 className='w-full h-10 pl-9 pr-3 rounded-2xl bg-[var(--bg-elevated)]
                                            text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                                            outline-none focus:ring-2 ring-[var(--accent)]'
                              />
                           </div>
                        </div>

                        {/* User list */}
                        <div className='max-h-56 overflow-y-auto px-2 py-2'>
                           {ordered.length === 0 ? (
                              <p className='text-center text-xs text-[var(--text-muted)] py-8'>
                                 {query ? 'No one by that name yet' : 'No one to share with yet'}
                              </p>
                           ) : (
                              ordered.map((u) => (
                                 <button
                                    key={u.id}
                                    onClick={() => setSelected(u)}
                                    disabled={u.id === meId}
                                    className={cn(
                                       'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left',
                                       selected?.id === u.id
                                          ? 'bg-[var(--accent-subtle)]'
                                          : 'hover:bg-[var(--bg-elevated)]'
                                    )}>
                                    {u.image_url ? (
                                       <img src={u.image_url} alt='' className='w-9 h-9 rounded-full object-cover' />
                                    ) : (
                                       <span className='w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500
                                                        flex items-center justify-center text-xs font-bold text-white'>
                                          {u.username.slice(0, 2).toUpperCase()}
                                       </span>
                                    )}
                                    <span className='text-sm text-[var(--text-primary)] truncate flex-1'>
                                       {u.username}
                                    </span>
                                    {selected?.id === u.id && (
                                       <CheckCircle className='w-5 h-5 text-[var(--accent)]' weight='fill' />
                                    )}
                                 </button>
                              ))
                           )}
                        </div>

                        {/* Note + send */}
                        <div className='px-5 pb-5 pt-1 space-y-3'>
                           <input
                              value={note}
                              maxLength={MAX_NOTE}
                              onChange={(e) => setNote(e.target.value)}
                              onKeyDown={(e) => {
                                 if (e.key === 'Enter' && selected) send()
                              }}
                              placeholder='Add a note (optional)'
                              aria-label='Optional note'
                              className='w-full h-10 px-4 rounded-2xl bg-[var(--bg-elevated)]
                                         text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                                         outline-none focus:ring-2 ring-[var(--accent)]'
                           />
                           <button
                              onClick={send}
                              disabled={!selected || sending}
                              className='w-full h-11 rounded-2xl bg-[var(--accent)] text-white text-sm font-semibold
                                         disabled:opacity-40 disabled:cursor-not-allowed
                                         hover:opacity-90 active:opacity-80 transition-opacity'>
                              {sending ? 'Sending…' : selected ? `Send to ${selected.username}` : 'Pick someone'}
                           </button>
                        </div>
                     </>
                  )}
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>
   )
}
