import { beforeEach, describe, expect, it } from 'vitest';

import type { DownloadJob } from '@/lib/api';
import { useDownloadsStore } from '@/store/downloads.store';
import { useToastStore } from '@/store/toast.store';

/**
 * The download contract: progress replaces a row, a completion is announced
 * once, and a failure is announced with its DCCNN code and the engine's own
 * words. That last part is the difference between "Download failed" and a
 * report someone can act on.
 */

function job(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: 'job1',
    owner: 'user_a',
    target: 'dQw4w9WgXcQ',
    trackId: 'dQw4w9WgXcQ',
    url: null,
    status: 'running',
    progress: 12.5,
    speed: 1024,
    eta: 30,
    totalBytes: 4096,
    downloadedBytes: 512,
    title: 'Fake Song',
    artist: 'Fake Artist',
    filename: '',
    error: null,
    errorCode: null,
    attempts: 1,
    resumable: false,
    stagedBytes: 0,
    active: true,
    createdAt: '2026-09-27T10:00:00+00:00',
    updatedAt: '2026-09-27T10:00:01+00:00',
    ...overrides,
  };
}

beforeEach(() => {
  useDownloadsStore.setState({ jobs: [], loading: false, announced: new Set<string>() });
  useToastStore.getState().clear();
});

describe('downloads store', () => {
  it('replaces a row rather than merging it', () => {
    const store = useDownloadsStore.getState();
    store.applyEvent('download:progress', job({ progress: 10 }));
    store.applyEvent('download:progress', job({ progress: 80 }));

    const jobs = useDownloadsStore.getState().jobs;
    expect(jobs).toHaveLength(1);
    // Merge semantics would keep whichever field the event omitted; replace
    // semantics cannot drift from what the engine actually reported.
    expect(jobs[0].progress).toBe(80);
  });

  it('keeps the newest job first', () => {
    useDownloadsStore.getState().applyEvent('download:queued', job({ id: 'old', createdAt: '2026-09-27T09:00:00+00:00' }));
    useDownloadsStore.getState().applyEvent('download:queued', job({ id: 'new', createdAt: '2026-09-27T11:00:00+00:00' }));

    expect(useDownloadsStore.getState().jobs.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('announces a completion with a success toast and no code', () => {
    useDownloadsStore.getState().applyEvent(
      'download:completed',
      job({ status: 'completed', active: false, progress: 100, filename: 'Fake Song.m4a' }),
    );

    const [toast] = useToastStore.getState().toasts;
    expect(toast.kind).toBe('success');
    expect(toast.title).toBe('Download complete');
    expect(toast.code).toBeUndefined();
  });

  it('announces a failure with the code and the engine’s own reason', () => {
    useDownloadsStore.getState().applyEvent(
      'download:failed',
      job({
        status: 'failed',
        active: false,
        errorCode: 'DEX01',
        error: 'YouTube refused this track on every client: Sign in to confirm you’re not a bot',
      }),
    );

    const [toast] = useToastStore.getState().toasts;
    expect(toast.kind).toBe('error');
    expect(toast.code).toBe('DEX01');
    expect(toast.detail).toContain('Sign in to confirm');
    // Errors stay until dismissed.
    expect(toast.duration).toBe(0);
  });

  it('announces a terminal state once even if the engine re-sends it', () => {
    const store = useDownloadsStore.getState();
    const failed = job({ status: 'failed', active: false, errorCode: 'DEX01', error: 'nope' });

    store.applyEvent('download:failed', failed);
    store.applyEvent('download:failed', failed);

    // A duplicate "Download failed" toast reads as a second failure.
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('does not toast for progress events', () => {
    useDownloadsStore.getState().applyEvent('download:progress', job());

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('ignores an event without a usable job id', () => {
    useDownloadsStore.getState().applyEvent('download:progress', { progress: 5 });

    expect(useDownloadsStore.getState().jobs).toEqual([]);
  });

  it('splits active from settled jobs', () => {
    const store = useDownloadsStore.getState();
    store.applyEvent('download:progress', job({ id: 'running' }));
    store.applyEvent('download:completed', job({ id: 'done', status: 'completed', active: false }));

    expect(useDownloadsStore.getState().active().map((item) => item.id)).toEqual(['running']);
    expect(useDownloadsStore.getState().settled().map((item) => item.id)).toEqual(['done']);
  });
});
