'use client';

import { create } from 'zustand';

import { ApiError, api, apiBase, type DownloadJob } from '@/lib/api';
import { openEventStream } from '@/lib/sse';
import { session } from '@/lib/session';
import { toast } from './toast.store';

/**
 * Downloads — the list, driven by events rather than by polling.
 *
 * The rule that decides this whole file: **a failure must never be a dead end.**
 * A failed job carries the engine's DCCNN code and the engine's own words, and
 * both reach the toast. That is the difference between "Download failed" and
 * "ERROR_CODE: DEX01 — YouTube refused this track on every client: …".
 *
 * Progress arrives over the event stream; each event carries the whole job, so
 * the store replaces the row rather than merging fields. A merge would need to
 * know which fields an event omits, and that is exactly the knowledge that goes
 * stale when the engine changes.
 */

interface DownloadsState {
  jobs: DownloadJob[];
  loading: boolean;
  /** Ids already announced, so a replayed event is not toasted twice. */
  announced: Set<string>;

  refresh: () => Promise<void>;
  create: (input: { trackId?: string; url?: string; title?: string }) => Promise<DownloadJob | null>;
  cancel: (jobId: string) => Promise<void>;
  retry: (jobId: string, resume?: boolean) => Promise<void>;
  remove: (jobId: string) => Promise<void>;

  /** Called by the connection hook when an engine event arrives. */
  applyEvent: (event: string, payload: unknown) => void;

  active: () => DownloadJob[];
  settled: () => DownloadJob[];
}

function order(jobs: DownloadJob[]): DownloadJob[] {
  return [...jobs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** The one place a failure becomes user-facing copy. */
function reportFailure(error: unknown, fallbackTitle: string): void {
  const apiError = error instanceof ApiError ? error : null;
  toast.error({
    title: apiError?.message ?? fallbackTitle,
    code: apiError?.code ?? undefined,
    detail: apiError?.explanation,
  });
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  jobs: [],
  loading: false,
  announced: new Set<string>(),

  refresh: async () => {
    set({ loading: true });
    try {
      const { jobs } = await api.downloads();
      set({ jobs: order(jobs), loading: false });
    } catch (error) {
      set({ loading: false });
      // A list that cannot load is a page state, not a toast: the API layer
      // already escalated it, so this stays quiet to avoid double reporting.
      void error;
    }
  },

  create: async (input) => {
    try {
      const job = await api.download(input);
      set((state) => ({ jobs: order([job, ...state.jobs.filter((item) => item.id !== job.id)]) }));
      return job;
    } catch (error) {
      reportFailure(error, 'Download failed');
      return null;
    }
  },

  cancel: async (jobId) => {
    try {
      const job = await api.cancelDownload(jobId);
      set((state) => ({ jobs: order([job, ...state.jobs.filter((item) => item.id !== job.id)]) }));
      toast.info('Download cancelled', 'Staged parts are kept so it can resume.');
    } catch (error) {
      reportFailure(error, 'Could not cancel the download');
    }
  },

  retry: async (jobId, resume) => {
    try {
      const job = await api.retryDownload(jobId, resume);
      set((state) => ({ jobs: order([job, ...state.jobs.filter((item) => item.id !== job.id)]) }));
    } catch (error) {
      reportFailure(error, 'Could not retry the download');
    }
  },

  remove: async (jobId) => {
    try {
      await api.deleteDownload(jobId);
      set((state) => ({ jobs: state.jobs.filter((item) => item.id !== jobId) }));
    } catch (error) {
      reportFailure(error, 'Could not remove the download');
    }
  },

  applyEvent: (event, payload) => {
    const job = payload as DownloadJob | undefined;
    if (!job || typeof job.id !== 'string') return;

    set((state) => ({ jobs: order([job, ...state.jobs.filter((item) => item.id !== job.id)]) }));

    const announced = get().announced;
    // Terminal states are announced once: the engine may re-send its last event
    // on reconnect, and a duplicate "Download complete" toast reads as a bug.
    const terminal = event === 'download:completed' || event === 'download:failed';
    if (terminal && announced.has(job.id)) return;
    if (terminal) {
      announced.add(job.id);
      set({ announced: new Set(announced) });
    }

    if (event === 'download:completed') {
      toast.success('Download complete', `${job.title || job.target} — ${job.artist || 'saved to your library'}`);
    } else if (event === 'download:failed') {
      toast.error({
        title: 'Download failed',
        code: job.errorCode ?? undefined,
        message: job.title || job.target,
        // The engine's own words, verbatim — this is the detail the ⓘ button
        // exists for, and summarising it is how the unhelpful copy happened.
        detail: job.error ?? undefined,
      });
    }
  },

  active: () => get().jobs.filter((job) => job.active),
  settled: () => get().jobs.filter((job) => !job.active),
}));

/**
 * Subscribe to the engine's progress stream.
 *
 * Returns an unsubscribe function. Called once, from the provider, so exactly
 * one connection exists no matter how many components show job state.
 */
export function connectDownloads(): () => void {
  return openEventStream(`${apiBase()}/api/realtime`, {
    headers: () => session().headers(),
    onEvent: (event) => {
      if (event.event === 'library:changed') {
        // A finished download changes the library; the list refetches rather
        // than trying to splice the new track in from the event payload.
        void useDownloadsStore.getState().refresh();
        return;
      }
      if (event.event.startsWith('download:')) {
        useDownloadsStore.getState().applyEvent(event.event, event.data);
      }
    },
    onError: () => {
      // The stream reconnects on its own; polling the list is the fallback so
      // progress keeps moving even if SSE stays unavailable.
      void useDownloadsStore.getState().refresh();
    },
  });
}
