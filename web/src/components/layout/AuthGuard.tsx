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
  // VITE_CLERK_PUBLISHABLE_KEY is baked at build time, so this branch is
  // constant for the lifetime of the bundle. Splitting into two components
  // keeps the useAuth() hook unconditional inside the Clerk-mounting subtree.
  if (!CLERK_PUBLISHABLE_KEY) {
    // Local / offline mode (no Clerk key configured) — no auth gate.
    return <>{children}</>
  }
  return <ClerkAuthGuard>{children}</ClerkAuthGuard>
}

function ClerkAuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    // Branded boot frame — replaces the black flash between splash & route.
    // Also covers restarts: while Clerk restores the session we never render
    // the Landing page, so a signed-in user is never bounced there on reload.
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
