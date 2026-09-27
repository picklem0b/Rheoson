import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DownloadJob } from '@/types/download.types'

// ── Constants ─────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(['queued', 'searching', 'downloading', 'converting', 'tagging'])

// ── Store ─────────────────────────────────────────────────────

interface DownloadStore {
  jobs: DownloadJob[]

  /**
   * Failures the user has already acknowledged.
   *
   * Failed jobs are persisted so the Downloads list stays a durable record,
   * but without this the activity pill re-announced a failure from any
   * earlier session on every launch — with no way to dismiss it, because the
   * pill had no handler and `clearDone` only clears `done`. Keeping the
   * acknowledgement forever (rather than in component state, which a reload
   * wipes) is what makes the dismissal actually stick.
   */
  dismissedErrors: string[]

  addJob:       (job: DownloadJob) => void
  updateJob:    (id: string, patch: Partial<DownloadJob>) => void
  removeJob:    (id: string) => void
  clearDone:    () => void
  dismissError: (id: string) => void
  getJob:       (id: string) => DownloadJob | undefined
}

//: Kept small — the list exists to stop re-alerting, not as a history.
const MAX_DISMISSED = 50

export const useDownloadStore = create<DownloadStore>()(
  persist(
    (set, get) => ({
      jobs: [],
      dismissedErrors: [],

      addJob: (job) =>
        set((s) => ({ jobs: [job, ...s.jobs] })),

      updateJob: (id, patch) =>
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
        })),

      removeJob: (id) =>
        set((s) => ({
          jobs: s.jobs.filter((j) => j.id !== id),
          // Drop the acknowledgement too, so the list cannot grow one dead
          // entry per deleted job.
          dismissedErrors: s.dismissedErrors.filter((d) => d !== id),
        })),

      clearDone: () =>
        set((s) => ({ jobs: s.jobs.filter((j) => j.status !== 'done') })),

      dismissError: (id) =>
        set((s) => ({
          dismissedErrors: [...s.dismissedErrors, id].slice(-MAX_DISMISSED),
        })),

      getJob: (id) =>
        get().jobs.find((j) => j.id === id),
    }),
    {
      name: 'rheoson-downloads',
      // Only persist completed/error jobs — in-flight jobs can't resume after
      // a page reload anyway, so drop them to avoid ghost "Downloading" entries.
      // Acknowledgements persist for the same reason the failures do.
      partialize: (s) => ({
        jobs: s.jobs.filter((j) => j.status === 'done' || j.status === 'error'),
        dismissedErrors: s.dismissedErrors,
      }),
    },
  ),
)

// ── Derived selectors (outside store — no stale closure risk) ──
// Call these in components instead of storing functions on state.

export const selectActiveJobs    = (s: DownloadStore) =>
  s.jobs.filter((j) => ACTIVE_STATUSES.has(j.status))

export const selectCompletedJobs = (s: DownloadStore) =>
  s.jobs.filter((j) => j.status === 'done')

export const selectErrorJobs     = (s: DownloadStore) =>
  s.jobs.filter((j) => j.status === 'error')

/**
 * The newest failure the user has not acknowledged, or null.
 *
 * The activity pill renders this rather than `selectErrorJobs[0]` so an
 * acknowledged failure stops being announced while remaining in the
 * Downloads list, where retry/resume still live.
 */
export const selectVisibleError = (s: DownloadStore) =>
  s.jobs.find(
    (j) => j.status === 'error' && !s.dismissedErrors.includes(j.id)
  ) ?? null
