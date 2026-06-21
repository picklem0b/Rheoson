import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Download, HardDrive, Clock } from 'lucide-react'
import { useDownloads } from '@/hooks/useDownloads'
import { tracksApi } from '@/api/tracks'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import DownloadRow from './components/DownloadRow'
import LibraryTrackRow from './components/LibraryTrackRow'

type Tab = 'active' | 'library'

export default function Downloads() {
  const { jobs, activeJobs, completedJobs, cancel, retry, clearDone } = useDownloads()
  const [tab, setTab] = useState<Tab>('library')

  // ── Actual files on disk — source of truth for "what's downloaded" ──
  // This is independent of the in-memory job store, so it survives
  // refreshes and shows everything in MUSIC_DIR regardless of how
  // it got there (download, manual copy, previous session, etc).
  const { data: libraryTracks, isLoading: loadingLibrary } = useQuery({
    queryKey:  ['tracks', 'all'],
    queryFn:   tracksApi.getAll,
    staleTime: 10_000,
  })

  const downloadedCount = libraryTracks?.length ?? 0

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-4 lg:px-8 pt-6 pb-4 flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Downloads</h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              {downloadedCount} {downloadedCount === 1 ? 'song' : 'songs'} on this device
            </p>
          </div>
          {tab === 'active' && completedJobs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearDone}>
              Clear done
            </Button>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab('library')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200',
              tab === 'library'
                ? 'bg-[var(--text-primary)] text-[var(--bg-base)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)]',
            )}
          >
            <HardDrive className="w-4 h-4" />
            Downloaded
          </button>
          <button
            onClick={() => setTab('active')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 relative',
              tab === 'active'
                ? 'bg-[var(--text-primary)] text-[var(--bg-base)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)]',
            )}
          >
            <Clock className="w-4 h-4" />
            Activity
            {activeJobs.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent)] text-[9px] font-bold text-white flex items-center justify-center">
                {activeJobs.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 lg:px-8 pb-6">

        {/* ── Downloaded tab — real files from MUSIC_DIR ───────── */}
        {tab === 'library' && (
          <>
            {loadingLibrary && (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-3xl" />
                ))}
              </div>
            )}

            {!loadingLibrary && downloadedCount === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-24 gap-4"
              >
                <div className="w-20 h-20 rounded-[2rem] bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--border)]">
                  <Download className="w-9 h-9 text-[var(--text-muted)]" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-[var(--text-primary)] text-lg">No downloads yet</p>
                  <p className="text-[var(--text-muted)] text-sm mt-1">Search for songs and save them</p>
                </div>
              </motion.div>
            )}

            {!loadingLibrary && downloadedCount > 0 && (
              <div className="space-y-1">
                {libraryTracks!.map((track, i) => (
                  <LibraryTrackRow key={track.id} track={track} index={i} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Activity tab — in-flight + recent job history ────── */}
        {tab === 'active' && (
          <AnimatePresence mode="popLayout">
            {jobs.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-24 gap-4"
              >
                <div className="w-20 h-20 rounded-[2rem] bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--border)]">
                  <Clock className="w-9 h-9 text-[var(--text-muted)]" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-[var(--text-primary)] text-lg">No activity</p>
                  <p className="text-[var(--text-muted)] text-sm mt-1">Downloads will show up here while in progress</p>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-2">
                {jobs.map((job, i) => (
                  <DownloadRow
                    key={job.id}
                    job={job}
                    index={i}
                    onCancel={() => cancel(job.id)}
                    onRetry={() => retry(job.id)}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        )}

      </ScrollArea>
    </div>
  )
}