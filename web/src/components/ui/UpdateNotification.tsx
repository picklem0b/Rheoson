import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { checkForUpdate, type VersionInfo } from '@/lib/versionCheck'

/**
 * UpdateNotification — detects new versions and shows a persistent,
 * dismissible banner. Checks on mount and every 6 hours.
 *
 * This component was orphaned during an App.tsx refactor: startVersionCheck
 * kept firing 5-second toasts nobody could act on, while the banner that
 * carries the Update button rendered for no one. Mounted again in
 * RootLayout so every page sees it.
 *
 * "Update" semantics per platform:
 *  - Web/PWA: the production build precaches every asset, so a plain reload
 *    installs the new bundle. Stale workers are unregistered first so the
 *    reload cannot resurrect the old precache.
 *  - Android/iOS: the app is served from the bundled dist, so reloading does
 *    nothing. The API advertises an APK download URL, and the store-less
 *    install path is in-place: same applicationId + a higher versionCode
 *    means Android sideloads it as an update over the existing install —
 *    no uninstall, no data loss, no "conflicting packages".
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

  const isNative = Capacitor.getPlatform() !== 'web'
  const apkUrl = updateInfo.downloadUrl?.trim()

  const handleUpdate = () => {
    if (isNative) {
      if (apkUrl) {
        // Served by the API (nginx) from the release APK — same applicationId,
        // higher versionCode → Android offers a straight in-place update.
        window.open(apkUrl, '_blank')
      } else {
        // No APK URL advertised: fall back to opening the releases page.
        window.open('https://github.com/picklem0b/Rheoson/releases/latest', '_blank')
      }
      return
    }
    // Web: install the precached update.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister())
      })
    }
    window.location.reload()
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -48, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed top-0 inset-x-0 z-[70] flex items-center gap-3 px-4 py-2.5 bg-brand/10 backdrop-blur-md border-b border-brand/20"
      >
        <Download className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
        <span className="text-xs font-semibold text-[var(--accent)] flex-1">
          New version {updateInfo.version} available
        </span>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleUpdate}
          className="px-3 py-1 rounded-full bg-[var(--accent)] text-white text-xs font-bold"
        >
          {isNative ? 'Get update' : 'Update'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setDismissed(true)}
          className="p-1"
          aria-label="Dismiss update banner"
        >
          <X className="w-3.5 h-3.5 text-[var(--accent)]" />
        </motion.button>
      </motion.div>
    </AnimatePresence>
  )
}
