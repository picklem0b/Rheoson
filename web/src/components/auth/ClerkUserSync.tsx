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
  const { isSignedIn, getToken } = useAuth()
  const { user } = useUser()
  const syncClerkUser = useAuthStore((s) => s.syncClerkUser)

  // Sync user data into the Zustand store
  useEffect(() => {
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
  }, [isSignedIn, user, syncClerkUser])

  // Sync session token for API auth headers
  useEffect(() => {
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
  }, [isSignedIn, getToken])

  return null
}
