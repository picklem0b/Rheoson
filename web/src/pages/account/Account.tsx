import { useNavigate } from 'react-router-dom'
import { UserProfile } from '@clerk/clerk-react'
import { isClerkEnabled } from '@/lib/constants'
import { ScrollArea } from '@/components/ui/ScrollArea'

/**
 * /account — Clerk's full account manager.
 *
 * The AccountSection row opens this as the "bigger" surface; the modal in
 * the section stays the quick path. In local mode (no Clerk key) the page
 * explains why it is empty instead of rendering a dead route.
 */
export default function Account() {
  const navigate = useNavigate()
  const clerk = isClerkEnabled()

  if (!clerk) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 text-center">
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">
            Account management unavailable
          </p>
          <p className="mt-2 text-[13px] text-[var(--text-muted)] leading-relaxed">
            This instance runs in local mode — there is no identity provider
            connected. Profile details live on the Profile page.
          </p>
          <button
            onClick={() => navigate('/profile')}
            className="mt-4 rounded-xl bg-[var(--bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] border border-[var(--border)]"
          >
            Go to profile
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg-base)]">
      <div className="px-5 pt-12 lg:pt-8 pb-2 flex-shrink-0">
        <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight">
          Account
        </h1>
      </div>
      <ScrollArea className="flex-1 px-4 pb-10">
        <div className="mx-auto w-full max-w-xl flex justify-center py-4">
          {/* Clerk's own multi-page manager: profile fields, email addresses,
              password, connected accounts, sessions. routing="hash" keeps
              its sub-navigation inside this route without extra URLs. */}
          <UserProfile routing="hash" />
        </div>
      </ScrollArea>
    </div>
  )
}
