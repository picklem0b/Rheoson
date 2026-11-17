import { ERRORS } from '@rheoson/shared'
import { Link } from 'react-router-dom'
import { ErrorCodeChip } from '@/components/feedback/errorCodeChip'

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-2xs uppercase tracking-[0.18em] text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">There is nothing here</h1>
      <p className="text-sm text-muted-foreground">
        The link may be old, or the screen may not exist yet.
      </p>
      <ErrorCodeChip code={ERRORS.CORE.NOT_FOUND} />
      <Link to="/" className="text-sm text-primary underline underline-offset-4">
        Back to the app
      </Link>
    </main>
  )
}
