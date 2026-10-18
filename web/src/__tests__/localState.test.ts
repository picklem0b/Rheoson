import { describe, it, expect, beforeEach } from 'vitest'
import {
   writeOfflineCache,
   readOfflineCache,
   clearOfflineCache
} from '@/lib/localState'

// The web build runs this module through its localStorage fallback (the
// Capacitor plugin is only present on device), so these tests exercise the
// branch every desktop/browser user takes — and the shared envelope logic
// both branches use.

describe('writeOfflineCache / readOfflineCache', () => {
   beforeEach(() => {
      window.localStorage.clear()
   })

   it('round-trips a payload through the envelope', async () => {
      writeOfflineCache('liked', 'user_abc', [{ id: 't1' }, { id: 't2' }])
      // Written fire-and-forget; the storage path resolves inline, but the
      // file path would not — one microtask boundary is enough for the test
      // to stay honest for both.
      await new Promise(r => setTimeout(r, 0))

      const envelope = await readOfflineCache<{ id: string }[]>('liked', 'user_abc')
      expect(envelope?.data).toEqual([{ id: 't1' }, { id: 't2' }])
      expect(envelope?.section).toBe('liked')
      expect(envelope?.format).toBe('rheoson-cache')
      expect(typeof envelope?.updatedAt).toBe('string')
   })

   it('namespaces per account, so two users never see each other', async () => {
      writeOfflineCache('liked', 'user_a', [{ id: 'a1' }])
      writeOfflineCache('liked', 'user_b', [{ id: 'b1' }])
      await new Promise(r => setTimeout(r, 0))

      const a = await readOfflineCache('liked', 'user_a')
      const b = await readOfflineCache('liked', 'user_b')
      expect(a?.data).toEqual([{ id: 'a1' }])
      expect(b?.data).toEqual([{ id: 'b1' }])
   })

   it('returns null for sections never written', async () => {
      expect(await readOfflineCache('history', 'user_nobody')).toBeNull()
   })

   it('refuses to overwrite a good copy with an empty one', async () => {
      writeOfflineCache('liked', 'user_abc', [{ id: 't1' }])
      await new Promise(r => setTimeout(r, 0))

      writeOfflineCache('liked', 'user_abc', [])
      await new Promise(r => setTimeout(r, 0))

      // The failed revalidation must not have erased the last-good mirror.
      const envelope = await readOfflineCache('liked', 'user_abc')
      expect(envelope?.data).toEqual([{ id: 't1' }])
   })

   it('clears one account without touching the other', async () => {
      writeOfflineCache('liked', 'user_a', [{ id: 'a1' }])
      writeOfflineCache('playlists', 'user_a', [{ id: 'p1' }])
      writeOfflineCache('liked', 'user_b', [{ id: 'b1' }])
      await new Promise(r => setTimeout(r, 0))

      await clearOfflineCache('user_a')

      expect(await readOfflineCache('liked', 'user_a')).toBeNull()
      expect(await readOfflineCache('playlists', 'user_a')).toBeNull()
      expect((await readOfflineCache('liked', 'user_b'))?.data).toEqual([{ id: 'b1' }])
   })
})
