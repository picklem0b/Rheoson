import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
   MagnifyingGlass,
   ArrowLeft,
   PaperPlaneRight,
   Users,
   MusicNote,
   Quotes,
   Play,
   X,
} from '@phosphor-icons/react'
import { messagesApi, type ChatMessage, type Conversation, type PresenceUser } from '@/api/messages.api'
import { tracksApi } from '@/api/tracks.api'
import { searchApi } from '@/api/search.api'
import { qk } from '@/lib/queryKeys'
import { useAuthStore } from '@/store/auth.store'
import { useWebSocket } from '@/lib/websocket.lib'
import { useQueue } from '@/hooks/queue.hook'
import { useToast } from '@/components/ui/Toaster'
import { Skeleton } from '@/components/ui/Skeleton'
import { ArtworkImage } from '@/components/ui/ArtworkImage'
import { splitErrorCode } from '@/api/client.api'
import { cn } from '@/lib/utils'
import type { Track } from '@/types/track.types'

/**
 * Messages — direct chats built around music.
 *
 * Threads carry rich shares: a track card plays on tap, a lyrics card
 * opens the shared lyric snippet on the track, and the header rail shows
 * who is online and what they're listening to — tap that chip to play
 * along. REST carries the truth; the socket (`message:new`) makes it
 * feel instant.
 */

// ── Share payload shape (what ShareToChatModal sends) ─────────

interface SharePayload {
   trackId?: string
   lyricsId?: string
   playlistId?: string
   albumId?: string
   artistId?: string
   blendId?: string
   title?: string
   subtitle?: string
   artworkUrl?: string
   snippet?: string
}

function sharePayload(msg: ChatMessage): SharePayload {
   return (msg.payload ?? {}) as SharePayload
}

// ── Page ──────────────────────────────────────────────────────

export default function Messages() {
   const [activePeer, setActivePeer] = useState<string | null>(null)

   return (
      <div className='flex flex-col h-full'>
         <AnimatePresence mode='wait' initial={false}>
            {activePeer === DEMO_BOT_ID ? (
               <motion.div
                  key='demo-thread'
                  className='h-full flex flex-col'
                  initial={{ x: 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 40, opacity: 0 }}
                  transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
                  <DemoBotThread onBack={() => setActivePeer(null)} />
               </motion.div>
            ) : activePeer ? (
               <motion.div
                  key='thread'
                  className='h-full flex flex-col'
                  initial={{ x: 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 40, opacity: 0 }}
                  transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
                  <ThreadView peerId={activePeer} onBack={() => setActivePeer(null)} />
               </motion.div>
            ) : (
               <motion.div
                  key='list'
                  className='h-full flex flex-col'
                  initial={{ x: -30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -30, opacity: 0 }}
                  transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
                  <ConversationList onOpen={setActivePeer} />
               </motion.div>
            )}
         </AnimatePresence>
      </div>
   )
}

// ── Presence rail (who's listening to what) ───────────────────

function PresenceRail({ onPlayTrack }: { onPlayTrack: (trackId: string) => void }) {
   const { on, off, emit, isConnected } = useWebSocket()
   const [live, setLive] = useState<PresenceUser[] | null>(null)

   useEffect(() => {
      const handler = (data: { users?: PresenceUser[] }) => {
         if (Array.isArray(data?.users)) setLive(data.users)
      }
      on('presence', handler)
      // Pull the first snapshot over REST, then keep the socket authoritative.
      messagesApi.getPresence()
         .then((p) => setLive((cur) => cur ?? p))
         .catch(() => undefined)
      if (isConnected()) emit('presence:list') // matches the presence_list handler
      return () => off('presence', handler)
   }, [on, off, emit, isConnected])

   const users = (live ?? []).filter((u) => u.listeningTo)

   if (users.length === 0) return null

   return (
      <div className='px-4 pt-3'>
         <p className='text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2'>
            Listening right now
         </p>
         <div className='flex gap-2 overflow-x-auto pb-2 scrollbar-none'>
            {users.map((u) => (
               <button
                  key={u.userId}
                  onClick={() => u.trackId && onPlayTrack(u.trackId)}
                  disabled={!u.trackId}
                  className={cn(
                     'flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full glass flex-shrink-0',
                     'border border-[var(--border)] transition-colors',
                     u.trackId && 'hover:border-[var(--accent)] active:scale-[0.98]'
                  )}
                  title={u.trackId ? `Play "${u.listeningTo}"` : `${u.username} is online`}>
                  {u.imageUrl ? (
                     <img src={u.imageUrl} alt='' className='w-7 h-7 rounded-full object-cover' />
                  ) : (
                     <span className='w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500
                                      flex items-center justify-center text-[10px] font-bold text-white'>
                        {u.username.slice(0, 2).toUpperCase()}
                     </span>
                  )}
                  <span className='flex flex-col items-start leading-tight'>
                     <span className='text-[11px] font-semibold text-[var(--text-primary)] max-w-[90px] truncate'>
                        {u.username}
                     </span>
                     <span className='text-[10px] text-[var(--text-muted)] max-w-[130px] truncate'>
                        {u.isPlaying ? `Listening to ${u.listeningTo}` : 'Paused'}
                     </span>
                  </span>
                  {u.trackId && u.isPlaying && (
                     <span className='relative flex h-2 w-2'>
                        <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-60' />
                        <span className='relative inline-flex rounded-full h-2 w-2 bg-[var(--accent)]' />
                     </span>
                  )}
               </button>
            ))}
         </div>
      </div>
   )
}

// ── Demo chat bot ─────────────────────────────────────────────

/**
 * Rheo — an on-device demo companion.
 *
 * When the deployment has no MongoDB (the common case for a Termux or
 * first-run instance), the real messaging service has nothing to stand
 * on: there are no peers to talk to, so the whole surface looks broken.
 * Rheo is a purely client-side conversation that exercises every message
 * shape — text, typing indicator, a shared track card that really plays,
 * a lyrics card — so the layout can be reviewed without a backend.
 *
 * Rheo never touches the network and only appears in the list; opening
 * the thread is a local view. Nothing here is persisted or sent.
 */

const DEMO_BOT_ID = 'demo-rheo'

const DEMO_REPLIES: string[] = [
   'Nice to meet you! I am a local demo — nothing I say leaves this device.',
   'I can share songs too — tap the card below to hear how it plays.',
   'Try the typing indicator… it should feel like a real chat.',
   'When MongoDB is running, real friends show up right here instead.',
]

function _demoId(): string {
   return `demo-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

function DemoBotThread({ onBack }: { onBack: () => void }) {
   const { playTrack } = useQueue()
   const navigate = useNavigate()
   const [messages, setMessages] = useState<ChatMessage[]>([
      {
         id: _demoId(),
         conversationId: DEMO_BOT_ID,
         senderId: DEMO_BOT_ID,
         kind: 'text',
         text: 'Hey! I am Rheo 👋 — a demo chat built into the app.',
         payload: {},
         createdAt: new Date().toISOString(),
      },
   ])
   const [draft, setDraft] = useState('')
   const [botTyping, setBotTyping] = useState(false)
   const bottomRef = useRef<HTMLDivElement>(null)

   useEffect(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
   }, [messages.length, botTyping])

   const _demoSong = async (): Promise<ChatMessage | null> => {
      try {
         const results = await searchApi.search('daft punk', 'tracks')
         const t = results.tracks?.[0]
         if (!t) return null
         return {
            id: _demoId(),
            conversationId: DEMO_BOT_ID,
            senderId: DEMO_BOT_ID,
            kind: 'track',
            text: t.title,
            payload: {
               trackId: t.id,
               title: t.title,
               subtitle: t.artist?.name ?? undefined,
               artworkUrl: t.artworkUrl ?? undefined,
            },
            createdAt: new Date().toISOString(),
         }
      } catch {
         return null
      }
   }

   const send = () => {
      const text = draft.trim()
      if (!text) return
      const mine: ChatMessage = {
         id: _demoId(),
         conversationId: DEMO_BOT_ID,
         senderId: 'me',
         kind: 'text',
         text,
         payload: {},
         createdAt: new Date().toISOString(),
      }
      setMessages((m) => [...m, mine])
      setDraft('')
      setBotTyping(true)
      window.setTimeout(
         () => {
            void (async () => {
               const wantsSong = /song|music|play|listen|share/i.test(text)
               const reply: ChatMessage | null = wantsSong
                  ? await _demoSong()
                  : null
               setBotTyping(false)
               setMessages((m) => [
                  ...m,
                  reply ?? {
                     id: _demoId(),
                     conversationId: DEMO_BOT_ID,
                     senderId: DEMO_BOT_ID,
                     kind: 'text',
                     text: DEMO_REPLIES[m.length % DEMO_REPLIES.length],
                     payload: {},
                     createdAt: new Date().toISOString(),
                  },
               ])
            })()
         },
         900 + Math.random() * 700,
      )
   }

   const openDemoCard = async (trackId: string, lyrics: boolean) => {
      try {
         const t = await tracksApi.getTrack(trackId)
         if (!t) throw new Error('not found')
         playTrack(t)
         if (lyrics) navigate('/full-player')
      } catch {
         /* demo card with an unresolvable track — nothing to do */
      }
   }

   return (
      <>
         <div className='flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-base)]'>
            <button
               onClick={onBack}
               aria-label='Back to conversations'
               className='w-9 h-9 rounded-full flex items-center justify-center
                          text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors'>
               <ArrowLeft className='w-5 h-5' />
            </button>
            <span className='w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500
                             flex items-center justify-center text-xs font-bold text-white'>R</span>
            <div className='min-w-0'>
               <p className='text-sm font-semibold text-[var(--text-primary)]'>Rheo</p>
               <p className='text-[10px] text-[var(--text-muted)]'>demo companion — replies stay on this device</p>
            </div>
         </div>

         <div className='flex-1 overflow-y-auto px-4 py-4 space-y-1'>
            <DemoBotBubbles
               messages={messages.map((m) => ({ msg: m, showMeta: true }))}
               meId='me'
               botTyping={botTyping}
               onPlay={(tid) => void openDemoCard(tid, false)}
               onOpenLyrics={(tid) => void openDemoCard(tid, true)}
            />
            <div ref={bottomRef} />
         </div>

         <div className='flex items-center gap-2 px-3 py-3 border-t border-[var(--border)] bg-[var(--bg-base)]'>
            <input
               value={draft}
               onChange={(e) => setDraft(e.target.value)}
               onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault()
                     send()
                  }
               }}
               placeholder='Say something to Rheo…'
               aria-label='Message text'
               className='flex-1 h-11 px-4 rounded-2xl bg-[var(--bg-elevated)]
                          text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                          outline-none focus:ring-2 ring-[var(--accent)]'
            />
            <button
               onClick={send}
               disabled={!draft.trim()}
               aria-label='Send message'
               className='w-11 h-11 rounded-full bg-[var(--accent)] text-white flex items-center justify-center
                          disabled:opacity-40 hover:opacity-90 active:opacity-80 transition-all flex-shrink-0'>
               <PaperPlaneRight className='w-5 h-5' weight='fill' />
            </button>
         </div>
      </>
   )
}

function DemoBotBubbles({ messages, meId, botTyping, onPlay, onOpenLyrics }: {
   messages: { msg: ChatMessage; showMeta: boolean }[]
   meId: string
   botTyping: boolean
   onPlay: (trackId: string) => void
   onOpenLyrics: (trackId: string) => void
}) {
   return (
      <>
         {messages.map(({ msg, showMeta }) => {
            const mine = msg.senderId === meId
            return (
               <div key={msg.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <motion.div
                     initial={{ opacity: 0, y: 8 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ duration: 0.18 }}
                     className={cn('max-w-[78%] space-y-1', mine ? 'items-end' : 'items-start')}>
                     {msg.kind === 'text' ? (
                        <div className={cn(
                           'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
                           mine
                              ? 'bg-[var(--accent)] text-white rounded-br-md'
                              : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-bl-md'
                        )}>
                           {msg.text}
                        </div>
                     ) : (
                        <DemoShareCard msg={msg} mine={mine} onPlay={onPlay} onOpenLyrics={onOpenLyrics} />
                     )}
                     {showMeta && msg.createdAt && (
                        <p className={cn('text-[10px] text-[var(--text-muted)] px-1', mine && 'text-right')}>
                           {formatDay(msg.createdAt)}
                        </p>
                     )}
                  </motion.div>
               </div>
            )
         })}
         {botTyping && (
            <div className='flex justify-start' aria-label='Rheo is typing'>
               <div className='px-4 py-3 rounded-2xl bg-[var(--bg-elevated)] rounded-bl-md flex items-center gap-1.5'>
                  {[0, 1, 2].map((i) => (
                     <motion.span
                        key={i}
                        className='w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]'
                        animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                     />
                  ))}
               </div>
            </div>
         )}
      </>
   )
}

function DemoShareCard({ msg, mine, onPlay, onOpenLyrics }: {
   msg: ChatMessage
   mine: boolean
   onPlay: (trackId: string) => void
   onOpenLyrics: (trackId: string) => void
}) {
   const p = sharePayload(msg)
   return (
      <div
         className={cn(
            'rounded-2xl overflow-hidden border w-60',
            mine
               ? 'bg-white/10 border-white/15 rounded-br-md'
               : 'bg-[var(--bg-surface)] border-[var(--border)] rounded-bl-md'
         )}>
         <button
            onClick={() => {
               const tid = p.trackId ?? p.lyricsId
               if (!tid) return
               if (msg.kind === 'lyrics') onOpenLyrics(tid)
               else onPlay(tid)
            }}
            className='flex items-center gap-3 p-2.5 w-full text-left hover:bg-white/5 transition-colors'>
            <div className='relative flex-shrink-0'>
               <ArtworkImage src={p.artworkUrl} alt='' size={44} radius='rounded-xl' />
               <span className='absolute inset-0 flex items-center justify-center'>
                  <span className='w-7 h-7 rounded-full bg-black/55 backdrop-blur flex items-center justify-center'>
                     <Play className='w-3.5 h-3.5 text-white' weight='fill' />
                  </span>
               </span>
            </div>
            <div className='min-w-0 flex-1'>
               <p className={cn(
                  'text-[10px] font-bold uppercase tracking-widest mb-0.5',
                  mine ? 'text-white/60' : 'text-[var(--accent)]'
               )}>
                  {msg.kind}
               </p>
               <p className={cn('text-sm font-semibold truncate', mine ? 'text-white' : 'text-[var(--text-primary)]')}>
                  {p.title ?? 'Shared music'}
               </p>
               {p.subtitle && (
                  <p className={cn('text-xs truncate', mine ? 'text-white/60' : 'text-[var(--text-muted)]')}>
                     {p.subtitle}
                  </p>
               )}
            </div>
         </button>
      </div>
   )
}

// ── Conversation list ─────────────────────────────────────────

function ConversationList({ onOpen }: { onOpen: (peerId: string) => void }) {
   const meId = useAuthStore((s) => s.user?.id)
   const { playTrack } = useQueue()

   const { data: conversations, isLoading } = useQuery({
      queryKey: qk.messagingConversations(),
      queryFn: messagesApi.getConversations,
      staleTime: 10_000,
   })

   const playFromPresence = async (trackId: string) => {
      try {
         const t = await tracksApi.getTrack(trackId)
         if (t) playTrack(t)
      } catch {
         // presence chip with an unresolvable track — ignore the tap
      }
   }

   const [userQuery, setUserQuery] = useState('')
   const { data: foundUsers = [] } = useQuery({
      queryKey: qk.messagingUsers(userQuery),
      queryFn: () => messagesApi.searchUsers(userQuery, 8),
      enabled: userQuery.trim().length > 0,
      staleTime: 15_000,
   })

   const openWith = async (peerId: string) => {
      // Ensure the thread exists before switching views.
      try { await messagesApi.send({ peerId, kind: 'text', text: '👋' }) } catch { /* empty threads are fine */ }
      onOpen(peerId)
   }

   const openDemo = () => onOpen(DEMO_BOT_ID)

   return (
      <div className='overflow-y-auto flex-1'>
         {/* Header */}
         <div className='px-4 pt-5 pb-3'>
            <h1 className='text-2xl font-bold text-[var(--text-primary)] tracking-tight'>Messages</h1>
            <p className='text-sm text-[var(--text-muted)] mt-0.5'>
               Share songs, lyrics and playlists with friends
            </p>
         </div>

         <PresenceRail onPlayTrack={(id) => void playFromPresence(id)} />

         {/* New-chat search */}
         <div className='px-4 pt-2 pb-2'>
            <div className='relative'>
               <MagnifyingGlass className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]' />
               <input
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder='Start a chat — find a friend…'
                  aria-label='Find a friend to message'
                  className='w-full h-10 pl-9 pr-9 rounded-2xl bg-[var(--bg-elevated)]
                             text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                             outline-none focus:ring-2 ring-[var(--accent)]'
               />
               {userQuery && (
                  <button
                     onClick={() => setUserQuery('')}
                     aria-label='Clear search'
                     className='absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]'>
                     <X className='w-4 h-4' />
                  </button>
               )}
            </div>
            {userQuery.trim() && (
               <div className='mt-2 rounded-2xl border border-[var(--border)] overflow-hidden'>
                  {foundUsers.length === 0 ? (
                     <p className='text-xs text-[var(--text-muted)] text-center py-4'>
                        No one by that name yet
                     </p>
                  ) : (
                     foundUsers.map((u) => (
                        <button
                           key={u.id}
                           onClick={() => void openWith(u.id)}
                           className='w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors text-left'>
                           {u.image_url ? (
                              <img src={u.image_url} alt='' className='w-9 h-9 rounded-full object-cover' />
                           ) : (
                              <span className='w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500
                                               flex items-center justify-center text-xs font-bold text-white'>
                                 {u.username.slice(0, 2).toUpperCase()}
                              </span>
                           )}
                           <span className='text-sm text-[var(--text-primary)]'>{u.username}</span>
                        </button>
                     ))
                  )}
               </div>
            )}
         </div>

         {/* Demo companion — always available, even without a database */}
         <button
            onClick={openDemo}
            className='mx-4 mt-3 mb-1 flex items-center gap-3 p-3 rounded-2xl border
                       border-[var(--border)] hover:border-[var(--accent)] transition-colors text-left'>
            <span className='w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500
                             flex items-center justify-center text-sm font-bold text-white flex-shrink-0'>R</span>
            <span className='flex-1 min-w-0'>
               <span className='block text-sm font-semibold text-[var(--text-primary)]'>Rheo</span>
               <span className='block text-xs text-[var(--text-muted)] truncate'>
                  Demo chat — see how messages feel
               </span>
            </span>
         </button>

         {/* Threads */}
         {isLoading ? (
            <div className='px-4 space-y-2'>
               {[0, 1, 2].map((i) => (
                  <div key={i} className='flex items-center gap-3 py-2'>
                     <Skeleton className='w-12 h-12 rounded-full' />
                     <div className='flex-1 space-y-2'>
                        <Skeleton className='h-3.5 w-1/3' />
                        <Skeleton className='h-3 w-2/3' />
                     </div>
                  </div>
               ))}
            </div>
         ) : (conversations?.length ?? 0) === 0 ? (
            <div className='flex flex-col items-center justify-center py-16 px-8 text-center gap-3'>
               <div className='w-14 h-14 rounded-3xl bg-[var(--bg-elevated)] flex items-center justify-center'>
                  <Users className='w-7 h-7 text-[var(--text-muted)]' />
               </div>
               <p className='text-[var(--text-secondary)] font-semibold'>No chats yet</p>
               <p className='text-sm text-[var(--text-muted)]'>
                  Find a friend above, or share a song from its menu.
               </p>
            </div>
         ) : conversations && conversations.length > 0 ? (
            <div className='px-2 pb-4'>
               {conversations.map((c) => (
                  <ConversationRow
                     key={c.id}
                     conversation={c}
                     meId={meId ?? ''}
                     onClick={() => onOpen(c.peer.id)}
                  />
               ))}
            </div>
         ) : null}
      </div>
   )
}

function ConversationRow({
   conversation: c,
   meId,
   onClick
}: {
   conversation: Conversation
   meId: string
   onClick: () => void
}) {
   const last = c.lastMessage
   const preview = last
      ? last.kind === 'text'
         ? last.text
         : last.kind === 'lyrics'
            ? `🎤 Lyrics — ${sharePayload(last).title ?? 'a song'}`
            : `🎵 ${sharePayload(last).title ?? last.kind}`
      : 'Say something…'

   return (
      <button
         onClick={onClick}
         className='w-full flex items-center gap-3 px-2.5 py-2.5 rounded-2xl
                    hover:bg-[var(--bg-elevated)] active:bg-[var(--bg-elevated)] transition-colors text-left'>
         {c.peer.image_url ? (
            <img src={c.peer.image_url} alt='' className='w-12 h-12 rounded-full object-cover flex-shrink-0' />
         ) : (
            <span className='w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500
                             flex items-center justify-center text-sm font-bold text-white flex-shrink-0'>
               {c.peer.username.slice(0, 2).toUpperCase()}
            </span>
         )}
         <div className='min-w-0 flex-1'>
            <div className='flex items-center justify-between gap-2'>
               <p className='text-sm font-semibold text-[var(--text-primary)] truncate'>{c.peer.username}</p>
               {last?.createdAt && (
                  <span className='text-[10px] text-[var(--text-muted)] flex-shrink-0'>
                     {formatDay(last.createdAt)}
                  </span>
               )}
            </div>
            <p className={cn(
               'text-xs truncate mt-0.5',
               last?.senderId === meId ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
            )}>
               {last?.senderId === meId && 'You: '}
               {preview}
            </p>
         </div>
      </button>
   )
}

// ── Thread view ───────────────────────────────────────────────

function ThreadView({ peerId, onBack }: { peerId: string; onBack: () => void }) {
   const meId = useAuthStore((s) => s.user?.id ?? '')
   const { toast } = useToast()
   const queryClient = useQueryClient()
   const { on, off, isConnected } = useWebSocket()
   const { playTrack } = useQueue()
   const navigate = useNavigate()

   const [draft, setDraft] = useState('')
   const [sending, setSending] = useState(false)
   const bottomRef = useRef<HTMLDivElement>(null)
   const [peerName, setPeerName] = useState('')

   const { data: messages, isLoading } = useQuery({
      queryKey: qk.messagingMessages(peerId),
      queryFn: () => messagesApi.getMessages(peerId, 60),
      staleTime: 5_000,
   })

   // Resolve the peer's display name from the conversations list if cached.
   const { data: conversations } = useQuery({
      queryKey: qk.messagingConversations(),
      queryFn: messagesApi.getConversations,
      staleTime: 30_000,
   })
   useEffect(() => {
      const c = conversations?.find((x) => x.peer.id === peerId)
      if (c) setPeerName(c.peer.username)
   }, [conversations, peerId])

   // Live arrival — the socket event carries the same shape as REST.
   useEffect(() => {
      const handler = (msg: ChatMessage) => {
         queryClient.setQueryData<ChatMessage[]>(qk.messagingMessages(peerId), (old) => {
            if (!old || old.some((m) => m.id === msg.id)) return old
            return [...old, msg]
         })
         void queryClient.invalidateQueries({ queryKey: qk.messagingConversations() })
      }
      on('message:new', handler)
      return () => off('message:new', handler)
   }, [on, off, queryClient, peerId])

   useEffect(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
   }, [messages?.length])

   const send = async () => {
      const text = draft.trim()
      if (!text || sending) return
      setSending(true)
      try {
         const msg = await messagesApi.send({ peerId, kind: 'text', text })
         queryClient.setQueryData<ChatMessage[]>(qk.messagingMessages(peerId), (old) =>
            old && old.some((m) => m.id === msg.id) ? old : [...(old ?? []), msg]
         )
         setDraft('')
         void queryClient.invalidateQueries({ queryKey: qk.messagingConversations() })
      } catch (err) {
         const raw = err instanceof Error ? err.message : 'Message could not be sent'
         const { message, code } = splitErrorCode(raw)
         toast(code ? `${message} — ${code}` : message, 'error', 5000)
      } finally {
         setSending(false)
      }
   }

   const playTrackCard = async (trackId: string) => {
      try {
         const t: Track | null = await tracksApi.getTrack(trackId)
         if (!t) throw new Error('not found')
         playTrack(t)
      } catch {
         toast('That track could not be played right now', 'error', 4000)
      }
   }

   const openLyricsCard = async (trackId: string) => {
      try {
         const t = await tracksApi.getTrack(trackId)
         if (!t) throw new Error('not found')
         playTrack(t)
         navigate('/full-player')
      } catch {
         toast('That track could not be played right now', 'error', 4000)
      }
   }

   // Group consecutive messages by sender for avatar rhythm.
   const grouped = useMemo(() => {
      const out: { msg: ChatMessage; showMeta: boolean }[] = []
      let prev: ChatMessage | null = null
      for (const m of messages ?? []) {
         out.push({ msg: m, showMeta: !prev || prev.senderId !== m.senderId })
         prev = m
      }
      return out
   }, [messages])

   return (
      <>
         {/* Header */}
         <div className='flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-base)]'>
            <button
               onClick={onBack}
               aria-label='Back to conversations'
               className='w-9 h-9 rounded-full flex items-center justify-center
                          text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors'>
               <ArrowLeft className='w-5 h-5' />
            </button>
            {peerName ? (
               <span className='w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500
                                flex items-center justify-center text-xs font-bold text-white'>
                  {peerName.slice(0, 2).toUpperCase()}
               </span>
            ) : (
               <span className='w-9 h-9 rounded-full bg-[var(--bg-elevated)]' />
            )}
            <p className='text-sm font-semibold text-[var(--text-primary)]'>
               {peerName || '…'}
            </p>
            {!isConnected() && (
               <span className='ml-auto text-[10px] text-[var(--warning)] font-semibold'>offline</span>
            )}
         </div>

         {/* Messages */}
         <div className='flex-1 overflow-y-auto px-4 py-4 space-y-1'>
            {isLoading ? (
               <div className='space-y-3'>
                  {[0, 1, 2, 3].map((i) => (
                     <Skeleton key={i} className={cn('h-10 rounded-2xl', i % 2 ? 'w-2/3 ml-auto' : 'w-2/3')} />
                  ))}
               </div>
            ) : (messages?.length ?? 0) === 0 ? (
               <div className='flex flex-col items-center justify-center py-16 gap-3 text-center'>
                  <MusicNote className='w-10 h-10 text-[var(--text-muted)]' />
                  <p className='text-sm text-[var(--text-muted)]'>
                     Share a song, lyrics or a blend — it starts here.
                  </p>
               </div>
            ) : (
               grouped.map(({ msg, showMeta }) => {
                  const mine = msg.senderId === meId
                  return (
                     <div key={msg.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                        <motion.div
                           initial={{ opacity: 0, y: 8 }}
                           animate={{ opacity: 1, y: 0 }}
                           transition={{ duration: 0.18 }}
                           className={cn('max-w-[78%] space-y-1', mine ? 'items-end' : 'items-start')}>
                           {msg.kind === 'text' ? (
                              <div className={cn(
                                 'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
                                 mine
                                    ? 'bg-[var(--accent)] text-white rounded-br-md'
                                    : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-bl-md'
                              )}>
                                 {msg.text}
                              </div>
                           ) : (
                              <ShareCard
                                 msg={msg}
                                 mine={mine}
                                 onPlay={() => {
                                    const p = sharePayload(msg)
                                    const tid = msg.kind === 'lyrics' ? p.lyricsId : p.trackId
                                    if (tid) {
                                       if (msg.kind === 'lyrics') void openLyricsCard(tid)
                                       else void playTrackCard(tid)
                                    }
                                 }}
                                 onOpen={() => {
                                    const p = sharePayload(msg)
                                    if (p.playlistId) navigate(`/playlist/${p.playlistId}`)
                                    else if (p.albumId) navigate(`/album/${p.albumId}`)
                                    else if (p.artistId) navigate(`/artist/${p.artistId}`)
                                    else if (p.blendId) navigate(`/blend/${p.blendId}`)
                                 }}
                              />
                           )}
                           {showMeta && msg.createdAt && (
                              <p className={cn('text-[10px] text-[var(--text-muted)] px-1', mine && 'text-right')}>
                                 {formatDay(msg.createdAt)}
                              </p>
                           )}
                        </motion.div>
                     </div>
                  )
               })
            )}
            <div ref={bottomRef} />
         </div>

         {/* Composer */}
         <div className='flex items-center gap-2 px-3 py-3 border-t border-[var(--border)] bg-[var(--bg-base)]'>
            <input
               value={draft}
               onChange={(e) => setDraft(e.target.value)}
               onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault()
                     void send()
                  }
               }}
               placeholder='Message…'
               aria-label='Message text'
               className='flex-1 h-11 px-4 rounded-2xl bg-[var(--bg-elevated)]
                          text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                          outline-none focus:ring-2 ring-[var(--accent)]'
            />
            <button
               onClick={() => void send()}
               disabled={!draft.trim() || sending}
               aria-label='Send message'
               className='w-11 h-11 rounded-full bg-[var(--accent)] text-white flex items-center justify-center
                          disabled:opacity-40 hover:opacity-90 active:opacity-80 transition-all flex-shrink-0'>
               <PaperPlaneRight className='w-5 h-5' weight='fill' />
            </button>
         </div>
      </>
   )
}

// ── Share cards ───────────────────────────────────────────────

function ShareCard({
   msg,
   mine,
   onPlay,
   onOpen
}: {
   msg: ChatMessage
   mine: boolean
   onPlay: () => void
   onOpen: () => void
}) {
   const p = sharePayload(msg)
   const isLyrics = msg.kind === 'lyrics'
   const isLinkable = msg.kind === 'playlist' || msg.kind === 'album' || msg.kind === 'artist' || msg.kind === 'blend'

   return (
      <div
         className={cn(
            'rounded-2xl overflow-hidden border w-60',
            mine
               ? 'bg-white/10 border-white/15 rounded-br-md'
               : 'bg-[var(--bg-surface)] border-[var(--border)] rounded-bl-md'
         )}>
         <button
            onClick={isLinkable ? onOpen : onPlay}
            className='flex items-center gap-3 p-2.5 w-full text-left hover:bg-white/5 transition-colors'>
            <div className='relative flex-shrink-0'>
               <ArtworkImage src={p.artworkUrl} alt='' size={44} radius='rounded-xl' />
               {!isLinkable && (
                  <span className='absolute inset-0 flex items-center justify-center'>
                     <span className='w-7 h-7 rounded-full bg-black/55 backdrop-blur flex items-center justify-center'>
                        <Play className='w-3.5 h-3.5 text-white' weight='fill' />
                     </span>
                  </span>
               )}
            </div>
            <div className='min-w-0 flex-1'>
               <p className={cn(
                  'text-[10px] font-bold uppercase tracking-widest mb-0.5',
                  mine ? 'text-white/60' : 'text-[var(--accent)]'
               )}>
                  {isLyrics ? 'Lyrics' : msg.kind}
               </p>
               <p className={cn('text-sm font-semibold truncate', mine ? 'text-white' : 'text-[var(--text-primary)]')}>
                  {p.title ?? 'Shared music'}
               </p>
               {p.subtitle && (
                  <p className={cn('text-xs truncate', mine ? 'text-white/60' : 'text-[var(--text-muted)]')}>
                     {p.subtitle}
                  </p>
               )}
            </div>
            {isLyrics && (
               <Quotes className={cn('w-4 h-4 flex-shrink-0', mine ? 'text-white/40' : 'text-[var(--text-muted)]')} />
            )}
         </button>
         {isLyrics && p.snippet && (
            <div className={cn(
               'px-3.5 pb-3 pt-1 text-xs italic leading-relaxed whitespace-pre-line',
               mine ? 'text-white/70' : 'text-[var(--text-secondary)]'
            )}>
               “{p.snippet}”
            </div>
         )}
      </div>
   )
}

// ── Small helpers ─────────────────────────────────────────────

function formatDay(iso: string): string {
   const d = new Date(iso)
   if (Number.isNaN(d.getTime())) return ''
   const now = new Date()
   const sameDay = d.toDateString() === now.toDateString()
   if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
   }
   return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
