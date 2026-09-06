import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { useAuth } from '@clerk/clerk-react'
import { CLERK_PUBLISHABLE_KEY } from '@/lib/constants'

/**
 * Route guard — when Clerk is configured, uses Clerk's auth state.
 * When Clerk is not configured (dev mode), uses the local auth store.
 * Guests are sent to /login which renders Clerk's <SignIn> component.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const clerkEnabled = !!CLERK_PUBLISHABLE_KEY

  if (clerkEnabled) {
    // Use Clerk's auth state
    const { isLoaded, isSignedIn } = useAuth()

    if (!isLoaded) return null
    if (!isSignedIn) {
      return <Navigate to="/login" replace state={{ from: location.pathname }} />
    }
    return <>{children}</>
  }

  // Fallback: local auth store (dev mode without Clerk)
  const ready = useAuthStore((s) => s.ready)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  if (!ready) return null
  // In dev mode without Clerk, allow access without auth
  return <>{children}</>
}
