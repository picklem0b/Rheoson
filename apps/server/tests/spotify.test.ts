import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../src/errors.js';
import { matchBatch, resolveLink } from '../src/services/spotify.service.js';

/**
 * The Spotify proxy's contract: validation happens *before* the engine (a
 * junk URL or batch never leaves this process), rows are sanitized (they end
 * up beside a subprocess), and engine failures arrive as coded ApiErrors the
 * client's toast and ⓘ panel already know how to render.
 */

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

function fetchStub(impl: (url: string, init: RequestInit) => Promise<Response>) {
  return vi.fn<FetchFn>(impl);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveLink', () => {
  it('rejects an empty URL before any request', async () => {
    await expect(resolveLink('user_a', '   ')).rejects.toMatchObject({ code: 'RVA01' });
  });

  it('rejects an oversized URL before any request', async () => {
    const fetchMock = fetchStub(async () => json(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLink('user_a', `https://open.spotify.com/track/${'x'.repeat(3000)}`)).rejects.toMatchObject({
      code: 'RVA02',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the URL encoded and the owner as a header', async () => {
    const fetchMock = fetchStub(async () =>
      json(200, { kind: 'track', track: { id: 'dQw4w9WgXcQ', title: 'x', artist: { id: 'a', name: 'a' }, album: { id: 'b', title: 'b' }, isDownloaded: false, source: 'youtube' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await resolveLink('user_a', 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(`/spotify/resolve?url=${encodeURIComponent('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc')}`);
    expect((init.headers as Record<string, string>)['X-Owner-Id']).toBe('user_a');
  });

  it("passes an engine 503's own code through — the registries are shared", async () => {
    vi.stubGlobal('fetch', fetchStub(async () => json(503, { error: 'down', code: 'SUP02' })));

    let thrown: unknown;
    try {
      await resolveLink('user_a', 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
    } catch (caught) {
      thrown = caught;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    const error = thrown as ApiError;
    expect(error.code).toBe('SUP02');
    expect(error.status).toBe(503);
  });

  it('names this capability when the engine is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      fetchStub(async () => {
        throw new TypeError('connect ECONNREFUSED');
      }),
    );

    let thrown: unknown;
    try {
      await resolveLink('user_a', 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
    } catch (caught) {
      thrown = caught;
    }

    const error = thrown as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    // Not SUP02 (streaming's code): an unreachable engine means Spotify
    // cannot resolve either, and the ⓘ copy should say which world broke.
    expect(error.code).toBe('RUP01');
    expect(error.status).toBe(503);
  });
});

describe('matchBatch', () => {
  it('rejects an empty or non-list payload', async () => {
    const fetchMock = fetchStub(async () => json(200, { tracks: [] }));
    vi.stubGlobal('fetch', fetchMock);

    for (const bad of [undefined, [], 'nope', {}]) {
      await expect(matchBatch('user_a', bad)).rejects.toMatchObject({ code: 'RVA03' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized batch', async () => {
    vi.stubGlobal('fetch', fetchStub(async () => json(200, { tracks: [] })));

    const rows = Array.from({ length: 51 }, (_, i) => ({ spotifyId: `id${i}`, title: 't', artist: 'a' }));
    await expect(matchBatch('user_a', rows)).rejects.toMatchObject({ code: 'RVA03' });
  });

  it('cleans rows and drops junk before the engine sees them', async () => {
    const fetchMock = fetchStub(async () => json(200, { tracks: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await matchBatch('user_a', [
      { spotifyId: '  4cOdK2wGLETKBW3PvgPWqT  ', title: '  Title  ', artist: '', durationMs: 213573.4 },
      'not-an-object',
      { spotifyId: '' },
      { spotifyId: 'x'.repeat(80) },
    ]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { tracks: Array<Record<string, unknown>> };
    expect(body.tracks).toHaveLength(1);
    expect(body.tracks[0]).toMatchObject({ spotifyId: '4cOdK2wGLETKBW3PvgPWqT', title: 'Title', artist: 'Unknown Artist', durationMs: 213573 });
  });

  it('rejects when every row was junk', async () => {
    vi.stubGlobal('fetch', fetchStub(async () => json(200, { tracks: [] })));

    await expect(matchBatch('user_a', ['nope', { spotifyId: '' }])).rejects.toMatchObject({ code: 'RVA03' });
  });
});
