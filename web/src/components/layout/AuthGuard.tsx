import Landing from '@/pages/landing/Landing'
import { useAuth } from '@clerk/clerk-react'
import { CLERK_PUBLISHABLE_KEY } from '@/lib/constants'

/**
 * Route guard.
 *
 * When Clerk is configured (VITE_CLERK_PUBLISHABLE_KEY set):
 *   - While Clerk is still loading we render a branded loader instead of
 *     returning null — a null return was the cause of a black screen after
 *     the splash animation.
 *   - Signed-out users are shown the public Landing page, whose
 *     "Get started" button opens Clerk's own Sign in / Sign up UI.
 *   - Signed-in users get the app.
 *
 * When Clerk is NOT configured (pure local / offline mode):
 *   - No gate at all — the app is usable without an account.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const clerkEnabled = !!CLERK_PUBLISHABLE_KEY

  if (clerkEnabled) {
    const { isLoaded, isSignedIn } = useAuth()

    if (!isLoaded) {
      // Branded boot frame — replaces the black flash between splash & route
      return (
        <div className="min-h-screen w-full bg-[var(--bg-base)] flex items-center justify-center">
          <div
            className="w-9 h-9 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin"
            role="status"
            aria-label="Loading"
          />
        </div>
      )
    }

    if (!isSignedIn) {
      return <Landing />
    }

    return <>{children}</>
  }

  // Local / offline mode (no Clerk key configured) — no auth gate.
  return <>{children}</>
}
