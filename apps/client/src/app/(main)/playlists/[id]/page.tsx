'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import TrackRow from '@/components/track/TrackRow';
import { Empty, Loading, PageHeading } from '@/components/ui/States';
import { ApiError, api, type Playlist, type Track } from '@/lib/api';
import { formatShortDate } from '@/lib/format';
import { usePlayerStore } from '@/store/player.store';
import { toast } from '@/store/toast.store';

/**
 * A playlist, opened.
 *
 * The library only knows a playlist's *track ids* — it does not carry the
 * tracks themselves — so this page resolves them through the track info route.
 * Resolving is deliberately per id and tolerant: one track that has since been
 * deleted from the library must not blank the whole page, so failures drop out
 * of the list while the rest of the playlist stays playable.
 */

export default function PlaylistPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const playlistId = typeof params.id === 'string' ? params.id : '';

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [missing, setMissing] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    if (!playlistId) return;
    void (async () => {
      try {
        const loaded = await api.playlist(playlistId);
        const resolved = await Promise.all(
          loaded.trackIds.map((id) => api.track(id).catch(() => null)),
        );
        setPlaylist(loaded);
        setTracks(resolved.filter((track): track is Track => track !== null));
        setMissing(resolved.length - resolved.filter(Boolean).length);
        setState('ready');
      } catch {
        // The API already escalated a 5xx; a 404 means the playlist is gone.
        setState('missing');
      }
    })();
  }, [playlistId]);

  const playAll = useCallback(() => {
    if (tracks.length === 0) return;
    void usePlayerStore.getState().playTrack(tracks[0], tracks);
  }, [tracks]);

  const remove = useCallback(
    async (track: Track) => {
      if (!playlist) return;
      try {
        const updated = await api.removeFromPlaylist(playlist.id, track.id);
        setPlaylist(updated);
        setTracks((current) => current.filter((item) => item.id !== track.id));
        toast.success('Removed from playlist', track.title);
      } catch (error) {
        const apiError = error instanceof ApiError ? error : null;
        toast.error({
          title: 'Could not remove that track',
          code: apiError?.code ?? 'PVA01',
          detail: apiError?.explanation ?? undefined,
        });
      }
    },
    [playlist],
  );

  if (state === 'loading') return <Loading label="Opening the playlist" />;

  if (state === 'missing' || !playlist) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeading title="Playlist" />
        <Empty text="That playlist does not exist — it may have been deleted." />
        <button
          type="button"
          onClick={() => router.push('/library')}
          className="mt-3 cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          Back to the library
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeading
        title={playlist.title}
        note={`${tracks.length} tracks · created ${formatShortDate(playlist.createdAt)}`}
      />

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={playAll}
          disabled={tracks.length === 0}
          className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'rgb(255 255 255)' }}
        >
          Play
        </button>
        {missing > 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {missing} {missing === 1 ? 'track is' : 'tracks are'} no longer in the library.
          </p>
        ) : null}
      </div>

      {tracks.length === 0 ? (
        <Empty text="Nothing here yet. Add tracks from the library or a search result." />
      ) : (
        <ul className="rounded-[14px] p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {tracks.map((track) => (
            <li key={track.id}>
              <TrackRow
                track={track}
                queue={tracks}
                showAlbum
                footer={
                  <button
                    type="button"
                    aria-label={`Remove ${track.title} from this playlist`}
                    title="Remove from playlist"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove(track);
                    }}
                    className="grid size-8 cursor-pointer place-items-center rounded-full transition-opacity active:opacity-60"
                    style={{ color: 'var(--danger-text)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 256 256" aria-hidden="true">
                      <path
                        d="M56 72h144M104 72V56h48v16M88 72l8 128h64l8-128"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="18"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
