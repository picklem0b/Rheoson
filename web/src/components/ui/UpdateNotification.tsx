import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X } from 'lucide-react'
import { checkForUpdate, type VersionInfo } from '@/lib/versionCheck'

/**
 * UpdateNotification — detects new versions and shows a dismissible banner.
 * Checks on mount and every 6 hours.
 */
export default function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    checkForUpdate().then(info => {
      if (info) setUpdateInfo(info)
    })
  }, [])

  if (!updateInfo || dismissed) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -48, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed top-0 inset-x-0 z-[70] flex items-center gap-3 px-4 py-2.5 bg-[var(--accent)]/10 backdrop-blur-md border-b border-[var(--accent)]/20"
      >
        <Download className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
        <span className="text-xs font-semibold text-[var(--accent)] flex-1">
          New version {updateInfo.version} available
        </span>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            // Force reload to pick up new service worker
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.getRegistrations().then(regs => {
                regs.forEach(r => r.unregister())
              })
            }
            window.location.reload()
          }}
          className="px-3 py-1 rounded-full bg-[var(--accent)] text-white text-xs font-bold"
        >
          Update
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setDismissed(true)}
          className="p-1"
        >
          <X className="w-3.5 h-3.5 text-[var(--accent)]" />
        </motion.button>
      </motion.div>
    </AnimatePresence>
  )
}
