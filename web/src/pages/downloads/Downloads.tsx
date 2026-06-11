import { motion, AnimatePresence } from 'framer-motion'
import { Download } from 'lucide-react'
import { useDownloads } from '@/hooks/useDownloads'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Button } from '@/components/ui/Button'
import DownloadRow from './components/DownloadRow'

export default function Downloads() {
  const { jobs, activeJobs, completedJobs, cancel, retry, clearDone } = useDownloads()

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="px-4 lg:px-8 pt-6 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Downloads</h1>
            {activeJobs.length > 0 && (
              <p className="text-sm text-[var(--text-muted)] mt-0.5">
                {activeJobs.length} active
              </p>
            )}
          </div>
          {completedJobs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearDone}>
              Clear done
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 lg:px-8 pb-6">
        <AnimatePresence mode="popLayout">
          {jobs.length === 0 ? (
            <motion.div
              key="empty"
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
      </ScrollArea>
    </div>
  )
}
