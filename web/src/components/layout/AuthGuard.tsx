import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'

/**
 * Route guard — guest mode was removed, so the whole app requires a
 * verified Clerk session. While the store finishes its mount-time token
 * check we render nothing (avoids redirect flicker for returning users),
 * then bounce unauthenticated visitors to /login.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const ready = useAuthStore((s) => s.ready)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()

  if (!ready) return null
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
