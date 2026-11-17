import { healthReportSchema } from '@rheoson/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorCodeChip } from '@/components/feedback/errorCodeChip'
import { TrackSearch } from '@/components/music/trackSearch'
import { AudioPlayer } from '@/components/player/audioPlayer'
import type { Playback } from '@/components/player/audioPlayer'
import { Button } from '@/components/ui/button'
import { ApiFailure } from '@/lib/api/apiError'
import { apiBaseUrl, apiGet } from '@/lib/api/httpClient'

/**
 * The environment milestone's only screen.
 *
 * It answers one question honestly: can this bundle reach that worker, and does
 * the worker know what it is configured with. Everything else the product does
 * arrives with the milestones in the roadmap.
 */
export function HomePage() {
  const [playback, setPlayback] = useState<Playback | null>(null)

  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet('/health', { schema: healthReportSchema, signal }),
  })

  const failure = health.error instanceof ApiFailure ? health.error : null

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-10 px-6 pt-16 pb-32">
      <header className="flex flex-col gap-3">
        <p className="text-2xs uppercase tracking-[0.18em] text-muted-foreground">
          v3.1.0 · listening
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Rheoson</h1>
        <p className="max-w-prose text-sm leading-6 text-muted-foreground">
          Search the open catalogue and play it. Accounts, the library and the shell land in the
          milestones after this one; the roadmap is the honest list.
        </p>
      </header>

      <TrackSearch onPlay={(tracks, index) => setPlayback({ tracks, index })} />

      <section
        aria-labelledby="status-heading"
        className="rounded-lg border border-border bg-card p-5 shadow-sm"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="status-heading" className="text-sm font-medium">
            Deployment
          </h2>
          {health.isPending ? (
            <span className="text-2xs text-muted-foreground">checking</span>
          ) : health.isError ? (
            <span className="text-2xs text-danger">unreachable</span>
          ) : (
            <span className="text-2xs text-success">ok</span>
          )}
        </div>

        <dl className="mt-5 divide-y divide-border text-sm">
          <Row label="API base" value={apiBaseUrl} mono />
          <Row label="Environment" value={health.data?.environment} />
          <Row label="Database" value={health.data?.checks.database} />
          <Row label="Accounts" value={health.data?.checks.accounts} />
        </dl>

        {health.isPending ? (
          <div className="mt-5 space-y-2" aria-hidden>
            <div className="h-3 w-2/3 animate-pulse rounded-xs bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded-xs bg-muted" />
          </div>
        ) : null}

        {failure ? (
          <div className="mt-5 flex flex-col items-start gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">{failure.message}</p>
            <div className="flex items-center gap-3">
              <ErrorCodeChip code={failure.code} />
              <Button variant="ghost" onClick={() => void health.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <footer className="text-2xs text-muted-foreground">
        The API answers even with no database and no account provider configured. That is the point
        of this page.
      </footer>

      <AudioPlayer playback={playback} />
    </main>
  )
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-2xs break-all text-right' : 'text-right'}>
        {value ?? <span className="text-muted-foreground">not reported</span>}
      </dd>
    </div>
  )
}
