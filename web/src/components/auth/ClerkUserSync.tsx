import { useEffect } from 'react'
import { useUser } from '@clerk/clerk-react'
import { useAuthStore } from '@/store/auth.store'

/**
 * Bridges Clerk's user state into the local Zustand auth store so the
 * rest of the app (profile page, sidebar avatar, etc.) can read user
 * data without directly depending on Clerk hooks everywhere.
 *
 * Mount this inside <ClerkProvider>.
 */
export default function ClerkUserSync() {
  const { isSignedIn, user } = useUser()
  const syncClerkUser = useAuthStore((s) => s.syncClerkUser)

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

  return null
}
