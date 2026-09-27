import { api } from './client.api'

/**
 * Messages API — REST surface for conversations, shares and presence.
 *
 * REST is the always-works path; the socket (`message:send` / `message:new`
 * via websocket.lib) is the fast path. Both hit the same backend service,
 * so a message sent over REST still arrives instantly for anyone online
 * (the backend socket-broadcasts after persisting).
 */

export interface PeerInfo {
   id: string
   username: string
   image_url: string
}

export type ShareKind = 'text' | 'track' | 'lyrics' | 'playlist' | 'album' | 'artist' | 'blend'

export interface ChatMessage {
   id: string
   conversationId: string
   senderId: string
   kind: ShareKind
   text: string
   payload: Record<string, unknown>
   createdAt: string
}

export interface Conversation {
   id: string
   peer: PeerInfo
   lastMessage: ChatMessage | null
   updatedAt: string
}

export interface PresenceUser {
   userId: string
   username: string
   imageUrl: string
   /** "{title} — {artist}" while playing, else null */
   listeningTo: string | null
   isPlaying: boolean
   /** Resolvable track id when `listeningTo` is set — makes the chip tappable. */
   trackId: string | null
}

export interface SendMessageInput {
   peerId: string
   kind?: ShareKind
   text?: string
   payload?: Record<string, unknown>
}

export const messagesApi = {
   searchUsers: (q: string, limit = 10) =>
      api.get<{ users: PeerInfo[] }>(
         `/messages/users/search?q=${encodeURIComponent(q)}&limit=${limit}`
      ).then((r) => r.users),

   getConversations: () =>
      api.get<{ conversations: Conversation[] }>('/messages/conversations')
         .then((r) => r.conversations),

   getMessages: (peerId: string, limit = 50, before?: string) => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (before) params.set('before', before)
      return api.get<{ messages: ChatMessage[] }>(
         `/messages/conversations/${encodeURIComponent(peerId)}?${params}`
      ).then((r) => r.messages)
   },

   send: (input: SendMessageInput) =>
      api.post<{ message: ChatMessage }>('/messages/send', {
         peer_id: input.peerId,
         kind: input.kind ?? 'text',
         text: input.text ?? null,
         payload: input.payload ?? null,
      }).then((r) => r.message),

   getPresence: () =>
      api.get<{ presence: PresenceUser[] }>('/messages/presence')
         .then((r) => r.presence),
}
