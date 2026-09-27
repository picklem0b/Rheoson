import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cancelDownload,
  createDownload,
  deleteDownload,
  getDownload,
  listDownloads,
  retryDownload,
  shapeJob,
} from '../src/services/downloads.service.js';

/**
 * The download proxy's contract with the client: camelCase out, owner always
 * attached, and validation done before a request is made — an invalid track id
 * must never reach the engine, which would pass it to a subprocess.
 */

function jobBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'job1',
    owner: 'user_a',
    target: 'dQw4w9WgXcQ',
    track_id: 'dQw4w9WgXcQ',
    url: null,
    status: 'running',
    progress: 42.5,
    speed: 2048,
    eta: 12,
    total_bytes: 8192,
    downloaded_bytes: 4096,
    title: 'Fake Song',
    artist: 'Fake Artist',
    album: 'Fake Album',
    filename: 'Fake Song.m4a',
    error: null,
    error_code: null,
    attempts: 1,
    resumable: true,
    stagedBytes: 4096,
    active: true,
    created_at: '2026-09-27T10:00:00+00:00',
    updated_at: '2026-09-27T10:00:05+00:00',
    ...overrides,
  };
}

/** A typed fetch stub: the tuple type is what makes `mock.calls[0][0]` usable. */
type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

function stub(body: Record<string, unknown>, status = 200) {
  const fetchMock = vi.fn<FetchFn>(
    async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shapeJob', () => {
  it('translates snake_case to the client contract', () => {
    const shaped = shapeJob(jobBody() as never);

    expect(shaped.trackId).toBe('dQw4w9WgXcQ');
    expect(shaped.totalBytes).toBe(8192);
    expect(shaped.downloadedBytes).toBe(4096);
    expect(shaped.errorCode).toBeNull();
    expect(shaped.resumable).toBe(true);
    expect(shaped.stagedBytes).toBe(4096);
    expect(shaped.createdAt).toBe('2026-09-27T10:00:00+00:00');
  });

  it('defaults missing optional fields instead of leaving undefined', () => {
    const shaped = shapeJob({ id: 'j', owner: 'u', target: 't', status: 'queued', progress: 0, speed: null, eta: null, title: '', artist: '', album: '', filename: '', attempts: 0, resumable: false, stagedBytes: 0, active: true, created_at: '', updated_at: '' } as never);

    expect(shaped.trackId).toBeNull();
    expect(shaped.downloadedBytes).toBe(0);
    expect(shaped.totalBytes).toBeNull();
    expect(shaped.error).toBeNull();
  });
});

describe('listing and reading', () => {
  it('scopes the request by owner', async () => {
    const fetchMock = stub({ jobs: [jobBody()] });

    const jobs = await listDownloads('user_a');

    expect(jobs).toHaveLength(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('owner=user_a');
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)['X-Owner-Id']).toBe('user_a');
  });

  it('reads one job by id, scoped by owner', async () => {
    const fetchMock = stub(jobBody());

    await getDownload('user_a', 'job1');

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/downloads/job1');
    expect(url).toContain('owner=user_a');
  });

  it('encodes an id rather than interpolating it raw', async () => {
    const fetchMock = stub(jobBody());

    await getDownload('user_a', 'job/../1');

    expect(String(fetchMock.mock.calls[0][0])).toContain('/downloads/job%2F..%2F1');
  });
});

describe('creating', () => {
  it('refuses a request that names neither a track nor a URL', async () => {
    const fetchMock = stub(jobBody());

    await expect(createDownload('user_a', {})).rejects.toMatchObject({ code: 'DVA03', status: 400 });
    // Validation happens before the request: nothing was sent.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the track and the title', async () => {
    const fetchMock = stub(jobBody());

    await createDownload('user_a', { trackId: 'dQw4w9WgXcQ', title: 'Fake Song' });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<string, unknown>;
    expect(body.trackId).toBe('dQw4w9WgXcQ');
    expect(body.title).toBe('Fake Song');
  });

  it('bounds the title so a long string cannot reach the engine unbounded', async () => {
    const fetchMock = stub(jobBody());

    await createDownload('user_a', { trackId: 'abc', title: 'x'.repeat(500) });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { title: string };
    expect(body.title.length).toBe(200);
  });
});

describe('mutations', () => {
  it('cancels a job', async () => {
    const fetchMock = stub(jobBody({ status: 'cancelled', active: false }));

    const job = await cancelDownload('user_a', 'job1');

    expect(job.status).toBe('cancelled');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cancel');
  });

  it('sends an empty body for an automatic resume', async () => {
    const fetchMock = stub(jobBody({ status: 'queued' }));

    await retryDownload('user_a', 'job1');

    // `undefined` means "continue if there is something to continue from" —
    // sending an explicit `false` would throw the staged bytes away.
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({});
  });

  it('sends an explicit resume decision when given one', async () => {
    const fetchMock = stub(jobBody({ status: 'queued' }));

    await retryDownload('user_a', 'job1', false);

    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ resume: false });
  });

  it('reports whether staging was kept on delete', async () => {
    stub({ id: 'job1', deleted: true, stagingKept: true });

    const result = await deleteDownload('user_a', 'job1');

    expect(result.stagingKept).toBe(true);
  });

  it('raises a coded not-found instead of returning a silent empty job', async () => {
    stub({ code: 'DNF01', error: 'Download job not found' }, 404);

    await expect(getDownload('user_b', 'job1')).rejects.toMatchObject({ code: 'DNF01', status: 404 });
  });
});
