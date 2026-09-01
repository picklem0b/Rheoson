import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { WifiOff, RefreshCw } from 'lucide-react'
import { api } from '@/api/client.api'

/**
 * OfflineBanner — detects when the backend API is unreachable and shows
 * a non-intrusive banner. Automatically re-checks every 30 seconds.
 *
 * On Android (Capacitor), also listens to the native 'online'/'offline'
 * events for immediate detection.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    let mounted = true
    let interval: ReturnType<typeof setInterval> | null = null

    async function check() {
      if (!mounted) return
      try {
        await api.get('/health', { signal: AbortSignal.timeout(5000) })
        if (mounted) setOffline(false)
      } catch {
        if (mounted) setOffline(true)
      }
    }

    // Initial check
    check()

    // Re-check every 30 seconds
    interval = setInterval(check, 30_000)

    // Listen to browser online/offline events
    const onOnline = () => { check() }
    const onOffline = () => { setOffline(true) }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      mounted = false
      if (interval) clearInterval(interval)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const handleRetry = async () => {
    setChecking(true)
    try {
      await api.get('/health', { signal: AbortSignal.timeout(8000) })
      setOffline(false)
    } catch {
      // still offline
    } finally {
      setChecking(false)
    }
  }

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-0 inset-x-0 z-[70] flex items-center justify-center gap-3 px-4 py-2.5 bg-amber-500/10 backdrop-blur-md border-b border-amber-500/20"
        >
          <WifiOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-amber-300">
            Server unreachable — some features may be limited
          </span>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleRetry}
            disabled={checking}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold hover:bg-amber-500/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
            Retry
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
