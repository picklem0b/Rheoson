import { afterEach, describe, expect, it, vi } from 'vitest';

import { engineHealthy, engineJson, engineStream, rescanLibrary } from '../src/services/engine.service.js';

/**
 * The engine client's job is translating between two worlds: the engine's
 * status codes and the API's DCCNN codes. A 5xx from the engine must never
 * reach the client as-is (the client's error page and ⓘ panel know the API's
 * registry, not the engine's internals), and an unreachable engine must name
 * the missing capability rather than a generic gateway failure.
 */

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A typed fetch stub: the signature is what makes `mock.calls` inspectable. */
type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

function fetchStub(impl: () => Promise<Response>) {
  return vi.fn<FetchFn>(async () => impl());
}

interface CodedFailure {
  code: string;
  status: number;
  detail?: string;
}

/** Await a call that must fail, and hand back the typed coded failure. */
async function failureOf(promise: Promise<unknown>): Promise<CodedFailure> {
  try {
    await promise;
  } catch (thrown) {
    return thrown as CodedFailure;
  }
  throw new Error('expected the call to fail');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('engineJson', () => {
  it('parses a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { tracks: [], total: 0 })));

    await expect(engineJson('/library/tracks')).resolves.toEqual({ tracks: [], total: 0 });
  });

  it('forwards the owner as a header — the client never names one', async () => {
    const fetchMock = fetchStub(async () => json(200, { jobs: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await engineJson('/downloads', { owner: 'user_a' });

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-Owner-Id']).toBe('user_a');
  });

  it('passes the engine’s own DCCNN code through a 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { code: 'SUP01', error: 'Track not available' })));

    const error = await failureOf(engineJson('/resolve/x'));

    expect(error.code).toBe('SUP01');
    expect(error.status).toBe(404);
  });

  it('maps a 409 to a conflict the client can act on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { code: 'DCN01', error: 'already running' })));

    const error = await failureOf(engineJson('/downloads', { method: 'POST' }));

    expect(error.status).toBe(409);
    expect(error.code).toBe('DCN01');
  });

  it('never turns an engine 5xx into a generic gateway error without a code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(500, { error: 'boom' })));

    const error = await failureOf(engineJson('/search'));

    expect(error.status).toBe(502);
    expect(error.code).toBe('SUP02');
  });

  it('reports an unreachable engine with the caller’s unavailable code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    const error = await failureOf(engineJson('/downloads', { unavailable: 'DEN02' }));

    expect(error.status).toBe(503);
    expect(error.code).toBe('DEN02');
    expect(String(error.detail)).toContain('Engine unreachable');
  });

  it('sends a JSON content type only when there is a body', async () => {
    const fetchMock = fetchStub(async () => json(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await engineJson('/x');
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)['Content-Type']).toBeUndefined();

    await engineJson('/x', { method: 'POST', body: { a: 1 } });
    expect((fetchMock.mock.calls[1][1].headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
});

describe('engineStream', () => {
  it('relays an opaque body without parsing it', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } })));

    const response = await engineStream('/artwork/x');

    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it('raises a coded error for a failed stream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { code: 'SNF02', error: 'Not downloaded locally' })));

    const error = await failureOf(engineStream('/artwork/x'));

    expect(error.code).toBe('SNF02');
  });
});

describe('engineHealthy', () => {
  it('is true for a healthy engine', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { status: 'ok' })));

    await expect(engineHealthy()).resolves.toBe(true);
  });

  it('is false rather than throwing when the engine is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    // The engine is optional: this decision belongs in a boolean, never in a
    // thrown error the caller has to catch to ask a yes/no question.
    await expect(engineHealthy()).resolves.toBe(false);
  });
});

describe('rescanLibrary', () => {
  it('posts to the rescan endpoint', async () => {
    const fetchMock = fetchStub(async () => json(200, { rescaned: true }));
    vi.stubGlobal('fetch', fetchMock);

    await rescanLibrary();

    expect(String(fetchMock.mock.calls[0][0])).toContain('/library/rescan');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });
});
