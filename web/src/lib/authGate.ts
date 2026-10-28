import { create } from 'zustand'
import { isClerkEnabled } from '@/lib/constants'

/**
 * Guest-first auth gate.
 *
 * The app is browsable without an account. Anything that touches per-user
 * data (likes, playlists, messages, follows…) calls `requestAuth()`; that
 * opens the AuthCard and resolves once the user has signed in (true) or
 * dismissed the card (false). The API client uses this so the original
 * request is simply retried after sign-in — the action "continues" without
 * any caller having to cache it by hand.
 */

interface PromptState {
  open: boolean
  reason: string | null
}

export const useAuthPrompt = create<PromptState>(() => ({ open: false, reason: null }))

const state = { resolved: false, signedIn: false }
const waiters: Array<(ok: boolean) => void> = []

/** Called by ClerkUserSync (and the local-mode store) whenever auth settles. */
export function setAuthState(resolved: boolean, signedIn: boolean): void {
  state.resolved = resolved
  state.signedIn = signedIn
  if (signedIn && waiters.length > 0) settleAuth(true)
}

export function isGuestNow(): boolean {
  return state.resolved && !state.signedIn
}

export function isAuthResolved(): boolean {
  return state.resolved
}

/** Open the sign-in card. Resolves true once signed in, false if dismissed. */
export function requestAuth(reason?: string): Promise<boolean> {
  if (state.signedIn) return Promise.resolve(true)
  // No Clerk key → there is nothing to sign in to.
  if (!isClerkEnabled()) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    waiters.push(resolve)
    useAuthPrompt.setState({ open: true, reason: reason ?? null })
  })
}

/** Close the card and release everything waiting on it. */
export function settleAuth(ok: boolean): void {
  useAuthPrompt.setState({ open: false, reason: null })
  for (const w of waiters.splice(0)) w(ok)
}

/** Human wording for why the card opened, derived from the endpoint. */
export function reasonForEndpoint(endpoint: string): string {
  if (/\/like|\/dislike/.test(endpoint)) return 'Sign in to save songs to your library'
  if (/\/playlists/.test(endpoint)) return 'Sign in to create and edit playlists'
  if (/\/messages/.test(endpoint)) return 'Sign in to chat with friends'
  if (/\/blends/.test(endpoint)) return 'Sign in to make blends with friends'
  if (/\/artists/.test(endpoint)) return 'Sign in to follow artists'
  if (/\/downloads/.test(endpoint)) return 'Sign in to download music'
  return 'Sign in to continue'
}

/** Guest mutations on these are fire-and-forget telemetry: skip, don't prompt. */
const SILENT_FOR_GUESTS = [/\/play$/, /\/signals/, /\/analytics/, /\/seen$/, /\/warm$/]

/** Endpoints a guest may call (any method). Everything else is account data. */
const GUEST_OK = [/^\/search/, /^\/stream/, /^\/lyrics/, /^\/health/, /^\/tracks\/trending/, /^\/tracks\/recently-played/]

export type GuestVerdict = 'allow' | 'silent' | 'read-blocked' | 'prompt'

export function guestVerdict(method: string, endpoint: string): GuestVerdict {
  const path = endpoint.split('?')[0]
  if (GUEST_OK.some((r) => r.test(path))) return 'allow'
  const read = method === 'GET' || method === 'HEAD'
  if (!read && SILENT_FOR_GUESTS.some((r) => r.test(path))) return 'silent'
  if (read) {
    // A single track's metadata is public; liked/stats/following are not.
    if (/^\/tracks\/(?!liked|stats|signals)[^/]+$/.test(path) || path === '/tracks/') return 'allow'
    return 'read-blocked'
  }
  return 'prompt'
}
