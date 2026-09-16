/**
 * Regression tests for the web/app.err crash.
 *
 * Bug: Sidebar and Profile called useUser()/useAuth() unconditionally,
 * but App.tsx only mounts <ClerkProvider> when VITE_CLERK_PUBLISHABLE_KEY
 * was baked into the bundle. A build without the key (the APK workflow
 * before the secret existed, or a VPS build without the export) produced
 * "useUser can only be used within the <ClerkProvider /> component." the
 * moment the shell rendered.
 *
 * These tests run in a keyless bundle (constants.ts resolves the key to ""
 * under vitest — asserted below), with the Clerk module mocked to throw
 * the exact production error. If anyone re-adds an unconditional Clerk
 * hook to a component mounted outside the provider, these tests fail with
 * that same message.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// The mock reproduces the crash signature from web/app.err verbatim: any
// Clerk hook called outside a provider must blow up the render, exactly
// like the real library does.
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => {
    throw new Error(
      'useUser can only be used within the <ClerkProvider /> component.'
    )
  },
  useAuth: () => {
    throw new Error(
      'useAuth can only be used within the <ClerkProvider /> component.'
    )
  },
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import Sidebar from '@/components/layout/Sidebar'
import Profile from '@/pages/profile/Profile'
import { CLERK_PUBLISHABLE_KEY } from '@/lib/constants'
import { useUser } from '@clerk/clerk-react'

// Premise check: these tests are only valid for a keyless bundle.
// A vitest run with the key set would be testing the wrong build mode.
describe('test-environment premise', () => {
  it('runs as a keyless build (no VITE_CLERK_PUBLISHABLE_KEY)', () => {
    expect(CLERK_PUBLISHABLE_KEY).toBe('')
  })
})

function renderShell(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('keyless bundle renders the shell without a ClerkProvider', () => {
  it('mock fires for unconditional Clerk-hook calls (tripwire check)', () => {
    function Bad() {
      // Exactly what the pre-fix Sidebar/Profile did.
      const { user } = useUser()
      void user
      return null
    }
    expect(() => renderShell(<Bad />)).toThrow(/ClerkProvider/)
  })

  it('sidebar profile button falls back to the local user, no crash', () => {
    renderShell(<Sidebar />)
    // Local-mode fallback name from the auth store (null user → default).
    expect(screen.getAllByText(/Your account/i).length).toBeGreaterThan(0)
  })

  it('profile page renders its body, no crash', () => {
    renderShell(<Profile />)
    expect(screen.getByText(/Your Rheoson account/i)).toBeTruthy()
  })
})
