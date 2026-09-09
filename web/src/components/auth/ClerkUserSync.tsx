import { useEffect } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useAuthStore } from '@/store/auth.store'
import { setClerkToken } from '@/api/client.api'

/**
 * Bridges Clerk's user state AND session token into the local Zustand
 * auth store so the rest of the app (profile page, sidebar avatar,
 * API requests) can work without directly depending on Clerk hooks.
 *
 * Mount this inside <ClerkProvider>.
 */
export default function ClerkUserSync() {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { user } = useUser()
  const syncClerkUser = useAuthStore((s) => s.syncClerkUser)

  // Sync user data into the Zustand store. Gated on isLoaded: while Clerk is
  // still resolving at boot, isSignedIn is not final — clearing the store then
  // would wipe a persisted session and flash the Landing page after a restart.
  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn && user) {
      syncClerkUser({
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName ?? user.username ?? undefined,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt?.toISOString(),
      })
    } else {
      syncClerkUser(null)
    }
  }, [isLoaded, isSignedIn, user, syncClerkUser])

  // Sync session token for API auth headers — never clears before Clerk loads.
  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn && getToken) {
      // Get the JWT and inject it for API requests
      getToken().then((token) => {
        setClerkToken(token)
      }).catch(() => {
        setClerkToken(null)
      })
    } else {
      setClerkToken(null)
    }
  }, [isLoaded, isSignedIn, getToken])

  return null
}
