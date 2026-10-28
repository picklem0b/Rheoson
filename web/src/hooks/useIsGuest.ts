import { useAuthStore } from '@/store/auth.store'
import { isClerkEnabled } from '@/lib/constants'

/**
 * True when the visitor is browsing without an account.
 *
 * Before Clerk finishes loading we trust the hint remembered from the last
 * visit, so a first-time visitor sees the guest screen on the very first
 * paint instead of a skeleton for data that will never exist.
 * Local mode (no Clerk key) has no accounts, so nobody is a "guest" there.
 */
export function useIsGuest(): boolean {
  const resolved = useAuthStore((s) => s.resolved)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hint = useAuthStore((s) => s.hintSignedIn)
  if (!isClerkEnabled()) return false
  return resolved ? !isAuthenticated : !hint
}
