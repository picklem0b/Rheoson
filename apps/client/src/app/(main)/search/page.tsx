'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import TrackRow, { Section } from '@/components/track/TrackRow';
import { Empty, Loading, PageHeading } from '@/components/ui/States';
import { ApiError, api, type SpotifyTrack, type Track } from '@/lib/api';
import { looksLikeSpotifyLink } from '@/lib/spotifyLink';
import { toast } from '@/store/toast.store';

/**
 * Search — one box, three sources, and never a blank screen.
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
 * * **A Spotify link is not a search.** Pasting one imports it: metadata
 *   resolves in one call, then YouTube matching runs in small batches so the
 *   matched rows arrive progressively instead of after one long, all-or-
 *   nothing wait. Unmatched rows stay visible and honest about why.
 *
 * The loading state is set from the input handler rather than from an effect:
 * an effect that sets state on render is a render loop waiting to happen, and
 * the user's keystroke is the event that actually knows a search is starting.
 */

const DEBOUNCE_MS = 300;

/** Batch size for YouTube matching — small enough that every chunk answers
 * well inside any timeout, big enough that a 50-track playlist is five calls. */
const MATCH_CHUNK = 10;

type Status = 'idle' | 'loading' | 'ready';

interface SearchState {
  status: Status;
  tracks: Track[];
  remoteAvailable: boolean;
  /** The query these results answer, so a stale set can be recognised. */
  forQuery: string;
}

const INITIAL: SearchState = { status: 'idle', tracks: [], remoteAvailable: true, forQuery: '' };

interface SpotifyState {
  /** null = no import running; otherwise the import's live state. */
  title: string;
  subtitle: string;
  artworkUrl: string | null;
  matched: Track[];
  unmatched: SpotifyTrack[];
  matching: number;
  done: boolean;
}

const SPOTIFY_INITIAL: SpotifyState = {
  title: '',
  subtitle: '',
  artworkUrl: null,
  matched: [],
  unmatched: [],
  matching: 0,
  done: false,
};

/** A matched Spotify row is just a Track — the whole downstream app treats it
 * like any other YouTube-backed track. Artwork goes through the API route so
 * the browser only ever talks to the app's own origin. */
function toTrack(row: SpotifyTrack): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    duration: row.duration,
    videoId: row.videoId,
    isDownloaded: row.isDownloaded,
    isLiked: false,
    artworkUrl: `/api/tracks/${encodeURIComponent(row.id)}/artwork`,
  };
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState(true);
  const [state, setState] = useState<SearchState>(INITIAL);
  const [spotify, setSpotify] = useState<SpotifyState | null>(null);
  const latest = useRef(0);

  const beginSearch = (value: string, withRemote: boolean) => {
    if (!value.trim()) {
      setState({ ...INITIAL, remoteAvailable: state.remoteAvailable });
      return;
    }
    setState((previous) => ({ ...previous, status: 'loading', remoteAvailable: withRemote }));
  };

  // ── Spotify import ─────────────────────────────────────────

  const matchRows = useCallback(async (rows: SpotifyTrack[], previouslyMatched: number) => {
    let ok = 0;
    const stillMissing: SpotifyTrack[] = [];
    for (let i = 0; i < rows.length; i += MATCH_CHUNK) {
      const chunk = rows.slice(i, i + MATCH_CHUNK);
      try {
        const result = await api.spotifyMatch(
          chunk.map((row) => ({
            spotifyId: row.id.replace(/^spotify:/, ''),
            title: row.title,
            artist: row.artist.name,
            artworkUrl: null,
          })),
        );
        for (const back of result.tracks) {
          if (back.videoId) {
            ok += 1;
            setSpotify((current) =>
              current
                ? { ...current, matched: [...current.matched, toTrack(back)], matching: current.matching - 1 }
                : current,
            );
          } else {
            stillMissing.push(back);
          }
        }
      } catch (error) {
        // A chunk that fails leaves its rows unmatched rather than killing
        // the import — the earlier chunks' matches are already on screen.
        stillMissing.push(...chunk);
        const apiError = error instanceof ApiError ? error : null;
        if (apiError) {
          toast.error({ title: apiError.message, code: apiError.code ?? undefined, detail: apiError.explanation });
        }
      }
      setSpotify((current) => (current ? { ...current, unmatched: [...stillMissing] } : current));
    }
    setSpotify((current) => (current ? { ...current, done: true, matching: 0, unmatched: stillMissing } : current));
    const imported = previouslyMatched + ok;
    if (imported > 0) {
      toast.success(imported === 1 ? 'Imported 1 track' : `Imported ${imported} tracks`);
    }
    if (stillMissing.length > 0 && imported > 0) {
      toast.info(
        `${stillMissing.length} ${stillMissing.length === 1 ? 'track' : 'tracks'} had no YouTube match`,
        'They stay in the list — try matching again later.',
      );
    }
  }, []);

  const importLink = useCallback(
    async (link: string) => {
      const ticket = (latest.current += 1);
      setSpotify({ ...SPOTIFY_INITIAL, matching: 0 });
      setState(INITIAL);
      try {
        // Metadata first — one call, no YouTube spent yet. The tracks arrive
        // unmatched, on screen immediately; matching runs below in chunks.
        const resolved = await api.spotifyResolve(link);
        if (ticket !== latest.current) return;
        const rows =
          resolved.kind === 'track'
            ? [resolved.track]
            : resolved.tracks;
        const title = resolved.kind === 'track' ? resolved.track.title : resolved.title;
        const subtitle = resolved.kind === 'track' ? resolved.track.artist.name : resolved.subtitle;

        const alreadyMatched = rows.filter((row) => row.videoId);
        const missing = rows.filter((row) => !row.videoId);
        setSpotify({
          title,
          subtitle,
          artworkUrl: resolved.kind === 'track' ? (resolved.track.artworkUrl ?? null) : (resolved.artworkUrl ?? null),
          matched: alreadyMatched.map(toTrack),
          unmatched: missing,
          matching: missing.length,
          done: false,
        });

        if (missing.length > 0) {
          await matchRows(missing, alreadyMatched.length);
        } else {
          setSpotify((current) => (current ? { ...current, done: true } : current));
          toast.success(alreadyMatched.length === 1 ? 'Imported 1 track' : `Imported ${alreadyMatched.length} tracks`);
        }
      } catch (error) {
        if (ticket !== latest.current) return;
        setSpotify(null);
        const apiError = error instanceof ApiError ? error : null;
        if (apiError) {
          toast.error({ title: apiError.message, code: apiError.code ?? undefined, detail: apiError.explanation });
        }
      }
    },
    [matchRows],
  );

  // ── Search / link detection ────────────────────────────────

  useEffect(() => {
    const trimmed = query.trim();

    if (looksLikeSpotifyLink(trimmed)) {
      const timer = window.setTimeout(() => {
        void importLink(trimmed);
      }, DEBOUNCE_MS);
      return () => window.clearTimeout(timer);
    }

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
  }, [query, remote, importLink]);

  const local = state.tracks.filter((track) => track.isDownloaded);
  const elsewhere = state.tracks.filter((track) => !track.isDownloaded);
  const unmatched = spotify?.unmatched ?? [];

  const retryMatching = () => {
    if (!spotify || unmatched.length === 0) return;
    setSpotify({ ...spotify, done: false, matching: unmatched.length });
    void matchRows(unmatched, spotify.matched.length);
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeading title="Search" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          autoFocus
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            // Mode switching is the event's job, not the effect's: a link
            // replaces any search, text replaces any import.
            if (looksLikeSpotifyLink(value)) {
              setState(INITIAL);
            } else {
              setSpotify(null);
              beginSearch(value, remote);
            }
          }}
          placeholder="Tracks, artists, albums — or paste a Spotify link"
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

      {spotify ? (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-[14px] p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            {spotify.artworkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={spotify.artworkUrl} alt="" className="size-14 rounded-[8px] object-cover" />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {spotify.title}
              </p>
              <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                {spotify.subtitle ? `From Spotify · ${spotify.subtitle}` : 'From Spotify'}
              </p>
              {!spotify.done ? (
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Matching on YouTube… {spotify.matching > 0 ? `${spotify.matching} left` : ''}
                </p>
              ) : null}
            </div>
          </div>

          <Section title="Matched — ready to play">
            {spotify.matched.length === 0 ? (
              <Empty text={spotify.done ? 'None of these tracks matched on YouTube.' : 'Matching…'} />
            ) : (
              <ul className="rounded-[14px] p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                {spotify.matched.map((track) => (
                  <li key={track.id}>
                    <TrackRow track={track} queue={spotify.matched} showAlbum />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {unmatched.length > 0 ? (
            <Section title="No match yet">
              <ul className="rounded-[14px] p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                {unmatched.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm" style={{ color: 'var(--text-primary)' }}>
                        {row.title}
                      </p>
                      <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {row.artist.name}
                        {row.matchError ? ` · [ERROR_CODE: ${row.matchError}]` : ''}
                      </p>
                    </div>
                    {spotify.done ? (
                      <button
                        type="button"
                        onClick={retryMatching}
                        className="shrink-0 rounded-[8px] px-3 py-1.5 text-xs"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                      >
                        Try again
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      ) : null}

      {state.status !== 'idle' && (!state.remoteAvailable || !remote) ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          {state.remoteAvailable ? 'Searching your library only.' : 'YouTube search is unavailable — showing your library only.'}
        </p>
      ) : null}

      {state.status === 'loading' && state.tracks.length === 0 ? <Loading label="Searching" /> : null}

      {state.status === 'idle' && !spotify ? (
        <div className="mt-6">
          <Empty text="Type to search your library, or paste a Spotify track, album or playlist link to import it." />
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
