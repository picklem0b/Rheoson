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
 * The listening screen.
 *
 * Search is the entry point, because the app has nothing to show until someone
 * asks for something. The deployment report is still here: a worker that cannot
 * answer is the one failure a listener cannot diagnose, so it is said plainly at
 * the bottom of the page instead of sitting in front of the catalogue.
 */
export function HomePage() {
  const [playback, setPlayback] = useState<Playback | null>(null)

  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet('/health', { schema: healthReportSchema, signal }),
  })

  const failure = health.error instanceof ApiFailure ? health.error : null

  const statusDot = health.isPending ? 'bg-warning' : health.isError ? 'bg-danger' : 'bg-success'
  const statusText = health.isPending
    ? 'Checking the API'
    : health.isError
      ? 'The API is unreachable'
      : `Connected · ${health.data?.environment ?? 'unknown'}`

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-6 pt-10 pb-32">
      <header className="flex items-center gap-3">
        <img src="/assets/logo.png" alt="" width={36} height={36} className="size-9 shrink-0" />
        <div className="flex min-w-0 flex-col">
          <h1 className="text-xl font-semibold tracking-tight">Rheoson</h1>
          <p className="truncate text-2xs text-muted-foreground">Search the open catalogue, play it</p>
        </div>
      </header>

      <TrackSearch onPlay={(tracks, index) => setPlayback({ tracks, index })} />

      <footer className="mt-auto flex flex-col gap-3 border-t border-border pt-5 text-2xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="flex items-center gap-2">
            <span aria-hidden className={`size-1.5 rounded-full ${statusDot}`} />
            {statusText}
          </p>
          <details className="w-full sm:w-auto">
            <summary className="w-fit cursor-pointer rounded-xs px-1 py-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              Deployment
            </summary>
            <dl className="mt-2 divide-y divide-border rounded-md border border-border bg-card px-3 py-1 text-sm">
              <Row label="API base" value={apiBaseUrl} mono />
              <Row label="Environment" value={health.data?.environment} />
              <Row label="Database" value={health.data?.checks.database} />
              <Row label="Accounts" value={health.data?.checks.accounts} />
            </dl>
          </details>
        </div>

        {failure ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">{failure.message}</p>
            <div className="flex items-center gap-3">
              <ErrorCodeChip code={failure.code} />
              <Button variant="ghost" onClick={() => void health.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : null}
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
