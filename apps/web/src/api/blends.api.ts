import { api } from './client.api'

/**
 * Blends API — collaborative playlists owned by nobody and everybody.
 *
 * Every member can rename, add/remove tracks, and invite/remove members;
 * only the owner can delete. Track ids use the same normalize.ts output
 * as playlists, so playback needs zero special-casing.
 */

export interface Blend {
   id: string
   name: string
   owner: string
   members: string[]
   tracks: string[]
   createdAt: string | null
   updatedAt: string | null
}

export const blendsApi = {
   list: () =>
      api.get<{ blends: Blend[] }>('/blends').then((r) => r.blends),

   get: (id: string) =>
      api.get<{ blend: Blend }>(`/blends/${encodeURIComponent(id)}`).then((r) => r.blend),

   create: (name: string) =>
      api.post<{ blend: Blend }>('/blends', { name }).then((r) => r.blend),

   rename: (id: string, name: string) =>
      api.patch<{ blend: Blend }>(`/blends/${encodeURIComponent(id)}`, { name })
         .then((r) => r.blend),

   remove: (id: string) =>
      api.delete<{ ok: boolean }>(`/blends/${encodeURIComponent(id)}`),

   addTrack: (id: string, trackId: string) =>
      api.post<{ blend: Blend }>(`/blends/${encodeURIComponent(id)}/tracks`, { track_id: trackId })
         .then((r) => r.blend),

   removeTrack: (id: string, trackId: string) =>
      api.delete<{ blend: Blend }>(
         `/blends/${encodeURIComponent(id)}/tracks/${encodeURIComponent(trackId)}`
      ).then((r) => r.blend),

   reorder: (id: string, trackIds: string[]) =>
      api.put<{ blend: Blend }>(`/blends/${encodeURIComponent(id)}/tracks`, { track_ids: trackIds })
         .then((r) => r.blend),

   addMember: (id: string, userId: string) =>
      api.post<{ blend: Blend }>(`/blends/${encodeURIComponent(id)}/members`, { user_id: userId })
         .then((r) => r.blend),

   removeMember: (id: string, userId: string) =>
      api.delete<{ blend: Blend }>(
         `/blends/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`
      ).then((r) => r.blend),
}
