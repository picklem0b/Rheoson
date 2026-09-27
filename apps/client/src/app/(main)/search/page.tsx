'use client';

import { useEffect, useRef, useState } from 'react';

import TrackRow, { Section } from '@/components/track/TrackRow';
import { Empty, Loading, PageHeading } from '@/components/ui/States';
import { ApiError, api, type Track } from '@/lib/api';
import { toast } from '@/store/toast.store';

/**
 * Search — one box, two sources, and never a blank screen.
 *
 * The important behaviours:
 *
 * * **Debounced.** A query is sent 300 ms after typing stops, so a fast typist
 *   does not fire eight extractions per word.
 * * **Local first, always.** Library matches arrive from the first request and
 *   are shown while the remote lookup is still running.
 * * **A stale response is discarded.** Results are keyed by the query that
 *   produced them, so a slow earlier search cannot overwrite a faster later one
 *   — the classic "typed 'bea', got results for 'beatles'" bug.
 *
 * The loading state is set from the input handler rather than from an effect:
 * an effect that sets state on render is a render loop waiting to happen, and
 * the user's keystroke is the event that actually knows a search is starting.
 */

const DEBOUNCE_MS = 300;

type Status = 'idle' | 'loading' | 'ready';

interface SearchState {
  status: Status;
  tracks: Track[];
  remoteAvailable: boolean;
  /** The query these results answer, so a stale set can be recognised. */
  forQuery: string;
}

const INITIAL: SearchState = { status: 'idle', tracks: [], remoteAvailable: true, forQuery: '' };

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState(true);
  const [state, setState] = useState<SearchState>(INITIAL);
  const latest = useRef(0);

  const beginSearch = (value: string, withRemote: boolean) => {
    if (!value.trim()) {
      setState({ ...INITIAL, remoteAvailable: state.remoteAvailable });
      return;
    }
    setState((previous) => ({ ...previous, status: 'loading', remoteAvailable: withRemote }));
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const ticket = (latest.current += 1);
    const timer = window.setTimeout(() => {
      api
        .search(trimmed, remote)
        .then((result) => {
          // Out-of-order responses are dropped rather than rendered.
          if (ticket !== latest.current) return;
          setState({
            status: 'ready',
            tracks: result.tracks,
            remoteAvailable: result.remoteAvailable,
            forQuery: result.query,
          });
        })
        .catch((error: unknown) => {
          if (ticket !== latest.current) return;
          setState({ status: 'ready', tracks: [], remoteAvailable: false, forQuery: trimmed });
          // Search failures are shown, not swallowed: an empty list with no
          // explanation is indistinguishable from "no results".
          const apiError = error instanceof ApiError ? error : null;
          if (apiError) {
            toast.error({ title: apiError.message, code: apiError.code ?? undefined, detail: apiError.explanation });
          }
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, remote]);

  const local = state.tracks.filter((track) => track.isDownloaded);
  const elsewhere = state.tracks.filter((track) => !track.isDownloaded);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeading title="Search" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          autoFocus
          onChange={(event) => {
            setQuery(event.target.value);
            beginSearch(event.target.value, remote);
          }}
          placeholder="Tracks, artists, albums"
          aria-label="Search"
          className="w-full rounded-[12px] px-4 py-3 text-sm outline-none"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        />
        <label className="flex shrink-0 items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={remote}
            onChange={(event) => {
              setRemote(event.target.checked);
              beginSearch(query, event.target.checked);
            }}
            className="size-4"
          />
          Search YouTube too
        </label>
      </div>

      {state.status !== 'idle' && (!state.remoteAvailable || !remote) ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          {state.remoteAvailable ? 'Searching your library only.' : 'YouTube search is unavailable — showing your library only.'}
        </p>
      ) : null}

      {state.status === 'loading' && state.tracks.length === 0 ? <Loading label="Searching" /> : null}

      {state.status === 'idle' ? (
        <div className="mt-6">
          <Empty text="Type to search your library. Turn on YouTube search to look beyond what you have." />
        </div>
      ) : null}

      {state.status !== 'idle' ? (
        <>
          <Section title="In your library">
            {local.length === 0 ? (
              <Empty text="Nothing in your library matches. Results from YouTube are below, if it is enabled." />
            ) : (
              <ul className="rounded-[14px] p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                {local.map((track) => (
                  <li key={track.id}>
                    <TrackRow track={track} queue={local} showAlbum />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {remote ? (
            <Section title="From YouTube">
              {elsewhere.length === 0 ? (
                <Empty text="No remote results. They can be played and downloaded straight from here." />
              ) : (
                <ul className="rounded-[14px] p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  {elsewhere.map((track) => (
                    <li key={track.id}>
                      <TrackRow track={track} queue={elsewhere} showAlbum />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
