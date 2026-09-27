import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePopupStore } from '@/store/popup.store';
import { useToastStore } from '@/store/toast.store';
import { looksLikeSpotifyLink } from '@/lib/spotifyLink';
import SearchPage from '@/app/(main)/search/page';

/**
 * The Spotify import flow's contract, from the user's side of the wire:
 *
 * * a pasted link is an import, not a search query;
 * * matched tracks become ordinary playable rows, progressively — a 50-track
 *   playlist must not wait for one all-or-nothing call;
 * * a track with no YouTube match stays visible and says so with its code;
 * * typing still searches, and clearing the box clears the import.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const PLAYLIST_ROW_A = {
  id: 'spotify:70cHKK8bHAfJrOGVnfRG9J',
  title: 'Nicole Kidman',
  artist: { id: 'ADÉLA', name: 'ADÉLA' },
  album: { id: 'Unknown Album', title: 'Unknown Album' },
  duration: 181.3,
  isDownloaded: false,
  source: 'youtube',
};

const PLAYLIST_ROW_B = {
  ...PLAYLIST_ROW_A,
  id: 'spotify:3DqUZkYTG9DjCAc1Rt6Uhe',
  title: 'Golden',
  artist: { id: 'HUNTR/X', name: 'HUNTR/X' },
};

function stubResolve(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/spotify/resolve')) return jsonResponse(200, body);
      if (url.includes('/api/spotify/match')) {
        return jsonResponse(200, {
          tracks: [{ ...PLAYLIST_ROW_B, id: '3DqUZkYTG9DjCAc1Rt6Uhe', videoId: 'yt_golden_01' }],
        });
      }
      return jsonResponse(200, { query: '', tracks: [], remoteAvailable: true });
    }),
  );
}

function routeFetch(handler: (url: string) => Response): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => handler(String(input))));
}

beforeEach(() => {
  useToastStore.getState().clear();
  usePopupStore.getState().close();
});

afterEach(() => {
  vi.unstubAllGlobals();
  useToastStore.getState().clear();
  usePopupStore.getState().close();
});

describe('looksLikeSpotifyLink', () => {
  it('recognises every shareable shape', () => {
    expect(looksLikeSpotifyLink('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=x')).toBe(true);
    expect(looksLikeSpotifyLink('https://spotify.link/abcFAKE123')).toBe(true);
    expect(looksLikeSpotifyLink('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toBe(true);
  });

  it('leaves normal text alone', () => {
    expect(looksLikeSpotifyLink('beatles hey jude')).toBe(false);
    expect(looksLikeSpotifyLink('open.spotify.com')).toBe(false);
    expect(looksLikeSpotifyLink('')).toBe(false);
  });
});

describe('pasting a Spotify link', () => {
  it('imports and matches progressively, then confirms with a success toast', async () => {
    stubResolve({
      kind: 'playlist',
      title: "Today's Top Hits",
      subtitle: 'Spotify',
      artworkUrl: null,
      tracks: [{ ...PLAYLIST_ROW_A, videoId: 'yt_known_01' }, PLAYLIST_ROW_B],
    });
    render(<SearchPage />);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' },
    });

    await waitFor(() => {
      expect(screen.getByText('Matched — ready to play')).toBeTruthy();
    });

    // The already-matched row renders immediately; the unmatched one arrives
    // after its batch call answers.
    await waitFor(() => {
      expect(screen.getByText('Golden')).toBeTruthy();
    });
    expect(screen.getByText('Nicole Kidman')).toBeTruthy();

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.some((toast) => toast.kind === 'success' && toast.title === 'Imported 2 tracks')).toBe(true);
    });
  });

  it('keeps an unmatched track visible with its code and a retry', async () => {
    stubResolve({
      kind: 'track',
      track: { ...PLAYLIST_ROW_B, id: 'spotify:abc123', title: 'Obscure B-Side' },
    });
    routeFetch((url) => {
      if (url.includes('/api/spotify/resolve')) {
        return jsonResponse(200, { kind: 'track', track: { ...PLAYLIST_ROW_B, id: 'spotify:abc123', title: 'Obscure B-Side' } });
      }
      if (url.includes('/api/spotify/match')) {
        return jsonResponse(200, {
          tracks: [{ ...PLAYLIST_ROW_B, id: 'abc123', matchError: 'RNF01' }],
        });
      }
      return jsonResponse(200, { query: '', tracks: [], remoteAvailable: true });
    });
    render(<SearchPage />);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'https://open.spotify.com/track/abc123' },
    });

    await waitFor(() => {
      expect(screen.getByText('No match yet')).toBeTruthy();
    });
    // The row stays and is honest about why.
    expect(screen.getByText('Obscure B-Side')).toBeTruthy();
    expect(screen.getByText(/\[ERROR_CODE: RNF01\]/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('shows a coded popup when the link cannot be resolved at all', async () => {
    routeFetch((url) =>
      url.includes('/api/spotify/resolve')
        ? jsonResponse(400, { error: 'Unsupported or unresolvable URL', code: 'RVA02', detail: null })
        : jsonResponse(200, { query: '', tracks: [], remoteAvailable: true }),
    );
    render(<SearchPage />);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'https://open.spotify.com/episode/3IMucVoNyYDUmJIepQe3w8' },
    });

    // Failures are popups — a toast never carries an error.
    await waitFor(() => {
      expect(usePopupStore.getState().popup?.code).toBe('RVA02');
    });
  });

  it('does not import ordinary text', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      jsonResponse(200, { query: 'beatles', tracks: [], remoteAvailable: true }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<SearchPage />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'beatles' } });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/search'))).toBe(true);
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/spotify/resolve'))).toBe(false);
  });
});
