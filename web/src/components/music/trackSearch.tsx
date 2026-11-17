import type { TrackSummary } from '@rheoson/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorCodeChip } from '@/components/feedback/errorCodeChip'
import { Button } from '@/components/ui/button'
import { ApiFailure } from '@/lib/api/apiError'
import { searchTracks } from '@/lib/api/catalogue'

/**
 * Search, and the one way into playback.
 *
 * The result list is the queue for now: pressing a row hands the whole list and
 * the row's position upward, so the player can move through it without knowing
 * where the list came from.
 */
export function TrackSearch({ onPlay }: { onPlay: (tracks: TrackSummary[], index: number) => void }) {
  const [term, setTerm] = useState('')
  const [query, setQuery] = useState('')

  const results = useQuery({
    queryKey: ['search', query],
    queryFn: ({ signal }) => searchTracks(query, signal),
    enabled: query.length > 0,
  })

  const failure = results.error instanceof ApiFailure ? results.error : null
  const items = results.data?.items ?? []

  return (
    <section aria-labelledby="search-heading" className="flex flex-col gap-4">
      <h2 id="search-heading" className="sr-only">
        Search
      </h2>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setQuery(term.trim())
        }}
      >
        <label htmlFor="track-search" className="sr-only">
          Search tracks and artists
        </label>
        <input
          id="track-search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search tracks and artists"
          autoComplete="off"
          spellCheck={false}
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={!term.trim()}>
          Search
        </Button>
      </form>

      {query ? (
        <p className="text-2xs text-muted-foreground">
          {results.isPending
            ? 'Searching'
            : items.length === 0
              ? `Nothing for “${query}”`
              : `${items.length} ${items.length === 1 ? 'track' : 'tracks'} for “${query}”`}
        </p>
      ) : null}

      {failure ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">{failure.message}</p>
          <ErrorCodeChip code={failure.code} />
          <Button variant="ghost" onClick={() => void results.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {items.map((track, index) => (
            <li key={track.id}>
              <button
                type="button"
                onClick={() => onPlay(items, index)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                {track.artworkUrl ? (
                  <img
                    src={track.artworkUrl}
                    alt=""
                    loading="lazy"
                    className="size-10 shrink-0 rounded-sm object-cover"
                  />
                ) : (
                  <span aria-hidden className="size-10 shrink-0 rounded-sm bg-muted" />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{track.title}</span>
                  <span className="truncate text-2xs text-muted-foreground">{track.artistName}</span>
                </span>
                <span className="ml-auto shrink-0 text-2xs text-muted-foreground">
                  {formatDuration(track.durationMs)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
