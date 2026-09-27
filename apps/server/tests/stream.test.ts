import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../src/errors.js';
import { prepareStream } from '../src/services/stream.service.js';
import {
  resetResolveCache,
  resetServiceHealthCache,
} from '../src/services/upstream.service.js';

/**
 * Streaming is two tiers with one outcome. These tests pin the *decisions*:
 * which tier served a request, when the server falls through instead of
 * surfacing a failure, and which DCCNN code a give-up produces.
 */

interface RecordedCall {
  url: string;
  range: string | undefined;
}

const calls: RecordedCall[] = [];

/** Build a fetch stub from URL → response rules. */
function stubFetch(handler: (url: string, range: string | undefined) => Response | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers((init?.headers as Record<string, string>) ?? {});
      const range = headers.get('range') ?? undefined;
      calls.push({ url, range });
      const response = handler(url, range);
      if (!response) throw new Error('network down');
      return response;
    }),
  );
}

function body(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function audioResponse(
  status: number,
  headers: Record<string, string>,
  payload = 'sound',
): Response {
  return new Response(status === 204 ? null : body(payload), { status, headers });
}

async function readPrepared(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString('utf8');
}

beforeEach(() => {
  calls.length = 0;
  resetResolveCache();
  resetServiceHealthCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('relay-first tier', () => {
  it('serves through the relay and mirrors its range headers', async () => {
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return audioResponse(200, {});
      if (url.includes('/relay/audio')) {
        return audioResponse(206, {
          'content-type': 'audio/mp4',
          'content-length': '6',
          'content-range': 'bytes 4-9/20',
        }, '456789');
      }
      return null;
    });

    const prepared = await prepareStream('dQw4w9WgXcQ', 'bytes=4-9');

    expect(prepared.source).toBe('relay');
    expect(prepared.status).toBe(206);
    expect(prepared.headers['content-range']).toBe('bytes 4-9/20');
    expect(prepared.headers['content-type']).toBe('audio/mp4');
    expect(prepared.headers['accept-ranges']).toBe('bytes');
    expect(prepared.headers['x-rheoson-source']).toBe('relay');
    expect(await readPrepared(prepared.body)).toBe('456789');

    // The client's Range header is forwarded verbatim — the CDN's own byte
    // arithmetic answers seeks, not a re-implementation of it.
    const relayed = calls.find((c) => c.url.includes('/relay/audio'));
    expect(relayed?.range).toBe('bytes=4-9');
  });

  it('never contacts the engine when the relay can serve', async () => {
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return audioResponse(200, {});
      if (url.includes('/relay/audio')) return audioResponse(200, { 'content-length': '5' });
      return null;
    });

    await prepareStream('dQw4w9WgXcQ', undefined);

    expect(calls.some((c) => c.url.includes('/resolve/'))).toBe(false);
  });

  it('falls through when the relay is unhealthy, without surfacing a relay error', async () => {
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return null;
      if (url.includes('/resolve/')) {
        return Response.json({ url: 'https://cdn.example/a.m4a', contentType: 'audio/mp4', expiresAt: 0 });
      }
      if (url.startsWith('https://cdn.example/')) {
        return audioResponse(200, { 'content-type': 'audio/mp4' }, 'direct-audio');
      }
      return null;
    });

    const prepared = await prepareStream('dQw4w9WgXcQ', undefined);

    expect(prepared.source).toBe('direct');
    expect(await readPrepared(prepared.body)).toBe('direct-audio');
  });

  it('falls through when a healthy relay cannot serve the track', async () => {
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return audioResponse(200, {});
      if (url.includes('/relay/audio')) return audioResponse(502, {});
      if (url.includes('/resolve/')) {
        return Response.json({ url: 'https://cdn.example/a.m4a', contentType: 'audio/mpeg', expiresAt: 0 });
      }
      if (url.startsWith('https://cdn.example/')) return audioResponse(200, {}, 'ok');
      return null;
    });

    const prepared = await prepareStream('dQw4w9WgXcQ', undefined);

    // A relay 5xx means "use the other path", never an error the user sees.
    expect(prepared.source).toBe('direct');
  });
});

describe('direct tier', () => {
  it('re-mints a refused URL exactly once before giving up', async () => {
    let resolveCount = 0;
    let cdnAttempts = 0;
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return null;
      if (url.includes('/resolve/')) {
        resolveCount += 1;
        return Response.json({ url: `https://cdn.example/a.m4a?v=${resolveCount}`, contentType: 'audio/mp4', expiresAt: 0 });
      }
      if (url.startsWith('https://cdn.example/')) {
        cdnAttempts += 1;
        // The first minted URL is refused; the re-minted one works.
        return cdnAttempts === 1 ? audioResponse(403, {}) : audioResponse(200, {}, 'second-try');
      }
      return null;
    });

    const prepared = await prepareStream('dQw4w9WgXcQ', undefined);

    expect(resolveCount).toBe(2);
    expect(await readPrepared(prepared.body)).toBe('second-try');
  });

  it('reports an unsatisfiable range with SVA01', async () => {
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return null;
      if (url.includes('/resolve/')) {
        return Response.json({ url: 'https://cdn.example/a.m4a', contentType: 'audio/mp4', expiresAt: 0 });
      }
      return audioResponse(416, {});
    });

    await expect(prepareStream('dQw4w9WgXcQ', 'bytes=999999-')).rejects.toMatchObject({
      code: 'SVA01',
      status: 416,
    });
  });

  it('maps an unavailable track to SUP01 with the upstream status', async () => {
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return null;
      if (url.includes('/resolve/')) {
        return Response.json({ url: 'https://cdn.example/a.m4a', contentType: 'audio/mp4', expiresAt: 0 });
      }
      return audioResponse(404, {});
    });

    const error = await prepareStream('dQw4w9WgXcQ', undefined).catch((e: ApiError) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('SUP01');
    expect((error as ApiError).status).toBe(404);
  });

  it('maps an unreachable CDN to SUP02', async () => {
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return null;
      if (url.includes('/resolve/')) {
        return Response.json({ url: 'https://cdn.example/a.m4a', contentType: 'audio/mp4', expiresAt: 0 });
      }
      return null;
    });

    await expect(prepareStream('dQw4w9WgXcQ', undefined)).rejects.toMatchObject({ code: 'SUP02' });
  });
});

describe('engine failures', () => {
  it('reports a definitive 404 as SUP01 so the client stops retrying', async () => {
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return null;
      if (url.includes('/resolve/')) return audioResponse(404, {});
      return null;
    });

    await expect(prepareStream('dQw4w9WgXcQ', undefined)).rejects.toMatchObject({
      code: 'SUP01',
      status: 404,
    });
  });

  it('reports a missing engine tool as DEN02', async () => {
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return null;
      if (url.includes('/resolve/')) return audioResponse(503, {});
      return null;
    });

    await expect(prepareStream('dQw4w9WgXcQ', undefined)).rejects.toMatchObject({
      code: 'DEN02',
      status: 503,
    });
  });

  it('reports an unreachable engine as SUP02', async () => {
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return null;
      return null;
    });

    await expect(prepareStream('dQw4w9WgXcQ', undefined)).rejects.toMatchObject({
      code: 'SUP02',
      status: 502,
    });
  });

  it('treats a resolution without a URL as a failure, not a stream', async () => {
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return null;
      if (url.includes('/resolve/')) return Response.json({ contentType: 'audio/mp4' });
      return null;
    });

    await expect(prepareStream('dQw4w9WgXcQ', undefined)).rejects.toMatchObject({ code: 'SUP02' });
  });
});

describe('health probe memoisation', () => {
  it('probes the relay once across concurrent requests', async () => {
    stubFetch((url) => {
      if (url.endsWith('/relay/health')) return audioResponse(200, {});
      if (url.includes('/relay/audio')) return audioResponse(200, {});
      return null;
    });

    await Promise.all([
      prepareStream('aaaa', undefined),
      prepareStream('bbbb', undefined),
      prepareStream('cccc', undefined),
    ]);

    const healthProbes = calls.filter((c) => c.url.endsWith('/relay/health'));
    expect(healthProbes.length).toBe(1);
  });
});
