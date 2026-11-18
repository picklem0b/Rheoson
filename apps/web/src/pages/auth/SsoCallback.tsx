import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react'
import { Navigate } from 'react-router-dom'
import { isClerkEnabled } from '@/lib/constants'

/** Landing spot for Google / GitHub / Apple sign-in; Clerk finishes the session. */
export default function SsoCallback() {
  if (!isClerkEnabled()) return <Navigate to="/" replace />
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
      <AuthenticateWithRedirectCallback signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" />
    </div>
  )
}
