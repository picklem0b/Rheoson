import { create } from 'zustand'
import type { DownloadJob, DownloadStatus } from '@/types/download'

interface DownloadStore {
  jobs: DownloadJob[]

  // Actions
  addJob:       (job: DownloadJob) => void
  updateJob:    (id: string, patch: Partial<DownloadJob>) => void
  removeJob:    (id: string) => void
  clearDone:    () => void

  // Selectors
  activeJobs:   () => DownloadJob[]
  completedJobs:() => DownloadJob[]
  getJob:       (id: string) => DownloadJob | undefined
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
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

  activeJobs: () =>
    get().jobs.filter((j) => !['done', 'error'].includes(j.status)),

  completedJobs: () =>
    get().jobs.filter((j) => j.status === 'done'),

  getJob: (id) =>
    get().jobs.find((j) => j.id === id),
}))