import type { ElementType } from 'react'
import { requestAuth } from '@/lib/authGate'

/** Full-page "sign in to use this" state for account-only screens. */
export default function GuestPrompt({
  icon: Icon,
  title,
  body,
  reason,
}: {
  icon: ElementType
  title: string
  body: string
  reason: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] border border-[var(--border)] bg-[var(--bg-elevated)]">
        <Icon className="h-8 w-8 text-[var(--text-muted)]" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">{title}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>
      </div>
      <button
        onClick={() => void requestAuth(reason)}
        className="rounded-2xl bg-[var(--accent)] px-8 py-3 text-sm font-bold text-white shadow-lg active:scale-[0.98]"
      >
        Sign in
      </button>
    </div>
  )
}
