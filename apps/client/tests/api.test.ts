import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, isPageStatus, onPageError, request } from '@/lib/api';

/**
 * The failure contract: every error carries a code, the status decides whether
 * it becomes a page or a toast, and a quiet caller is never escalated.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Await a request that must fail, and hand back the typed failure. */
async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (thrown) {
    if (thrown instanceof ApiError) return thrown;
    throw thrown;
  }
  throw new Error('expected the request to fail');
}

beforeEach(() => {
  onPageError(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  onPageError(null);
});

describe('ApiError', () => {
  it('prefers the server copy and keeps the code and detail', () => {
    const error = new ApiError(404, { error: 'Track not found', code: 'TNF01', detail: 'videoId abc' });

    expect(error.message).toBe('Track not found');
    expect(error.code).toBe('TNF01');
    expect(error.detail).toBe('videoId abc');
    expect(error.explanation).toContain('[ERROR_CODE: TNF01]');
    expect(error.explanation).toContain('videoId abc');
  });

  it('falls back to the registry copy when the server sends only a code', () => {
    const error = new ApiError(409, { code: 'DCN01' });

    // The shared registry is what makes a code traceable to one raise site.
    expect(error.message).toBe('That download is already running');
  });

  it('never renders an empty message', () => {
    expect(new ApiError(500, {}).message).toBe('Something went wrong');
    expect(new ApiError(500, {}).explanation).toBe('Something went wrong');
  });
});

describe('isPageStatus', () => {
  it('treats auth, forbidden, rate-limit and every 5xx as page states', () => {
    for (const status of [401, 403, 404, 429, 500, 502, 503, 504]) {
      expect(isPageStatus(status)).toBe(true);
    }
  });

  it('leaves ordinary validation failures as toasts', () => {
    for (const status of [400, 409, 416, 422]) {
      expect(isPageStatus(status)).toBe(false);
    }
  });
});

describe('request', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { ok: true })));

    await expect(request<{ ok: boolean }>('/api/x')).resolves.toEqual({ ok: true });
  });

  it('throws a coded error and escalates a 5xx to the page handler', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(502, { error: 'Bad gateway', code: 'SUP02', detail: 'engine down' })));
    const handler = vi.fn();
    onPageError(handler);

    await expect(request('/api/x')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].status).toBe(502);
    expect(handler.mock.calls[0][0].code).toBe('SUP02');
  });

  it('does not escalate a quiet request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { code: 'DEX01' })));
    const handler = vi.fn();
    onPageError(handler);

    await expect(request('/api/x', { quiet: true })).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not escalate a 400 — a validation failure is a toast', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { code: 'DVA04', error: 'Invalid track id' })));
    const handler = vi.fn();
    onPageError(handler);

    await expect(request('/api/x')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('turns a network failure into a coded 503 rather than an unlabelled error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const handler = vi.fn();
    onPageError(handler);

    const error = await failureOf(request('/api/x'));

    expect(error.status).toBe(503);
    expect(error.code).toBe('SUP02');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('treats a non-JSON error body as an uncoded failure, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));

    const error = await failureOf(request('/api/x'));

    expect(error.status).toBe(502);
    expect(error.code).toBeNull();
    expect(error.message).toBe('Something went wrong');
  });

  it('returns undefined for a 204', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));

    await expect(request('/api/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
