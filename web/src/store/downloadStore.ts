import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DownloadJob } from '@/types/download'

// ── Constants ─────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(['queued', 'searching', 'downloading', 'converting', 'tagging'])

// ── Store ─────────────────────────────────────────────────────

interface DownloadStore {
  jobs: DownloadJob[]

  addJob:    (job: DownloadJob) => void
  updateJob: (id: string, patch: Partial<DownloadJob>) => void
  removeJob: (id: string) => void
  clearDone: () => void
  getJob:    (id: string) => DownloadJob | undefined
}

export const useDownloadStore = create<DownloadStore>()(
  persist(
    (set, get) => ({
      jobs: [],

      addJob: (job) =>
        set((s) => ({ jobs: [job, ...s.jobs] })),

      updateJob: (id, patch) =>
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
        })),

      removeJob: (id) =>
        set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),

      clearDone: () =>
        set((s) => ({ jobs: s.jobs.filter((j) => j.status !== 'done') })),

      getJob: (id) =>
        get().jobs.find((j) => j.id === id),
    }),
    {
      name: 'shulker-downloads',
      // Only persist completed/error jobs — in-flight jobs can't resume after
      // a page reload anyway, so drop them to avoid ghost "Downloading" entries.
      partialize: (s) => ({
        jobs: s.jobs.filter((j) => j.status === 'done' || j.status === 'error'),
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
