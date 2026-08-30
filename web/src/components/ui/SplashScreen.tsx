import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const SPLASH_KEY   = 'rheoson-splash-last'
const COOLDOWN_MS  = 1000 * 60 * 30   // 30 min cooldown — shows on fresh load or after 30 min

export function useSplash() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const last = parseInt(localStorage.getItem(SPLASH_KEY) || '0', 10)
    const now  = Date.now()
    if (now - last > COOLDOWN_MS) {
      setShow(true)
      localStorage.setItem(SPLASH_KEY, String(now))
    }
  }, [])

  const dismiss = () => setShow(false)
  return { show, dismiss }
}

interface SplashScreenProps {
  onDone: () => void
}

export default function SplashScreen({ onDone }: SplashScreenProps) {
  const videoRef      = useRef<HTMLVideoElement>(null)
  const [fading, setFading] = useState(false)

  // Auto-dismiss after 5s (video length) + 0.3s buffer, or on video end
  useEffect(() => {
    const fadeTimer   = setTimeout(() => setFading(true), 5000)
    const dismissTimer= setTimeout(() => onDone(),         5600)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(dismissTimer)
    }
  }, [onDone])

  const handleVideoEnd = () => {
    setFading(true)
    setTimeout(onDone, 600)
  }

  return (
    <AnimatePresence>
      {!fading && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-black"
          onClick={() => { setFading(true); setTimeout(onDone, 600) }}
        >
          {/* Animated logo video — full screen, centred */}
          <video
            ref={videoRef}
            src="/assets/anim-logo.mp4"
            autoPlay
            muted
            playsInline
            onEnded={handleVideoEnd}
            className="w-64 h-64 object-contain select-none pointer-events-none"
          />

          {/* Tagline fades in after video settles */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.5 }}
            className="mt-6 text-xs tracking-[0.25em] font-semibold uppercase"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            Music. Downloaded. Played.
          </motion.p>

          {/* Red progress bar sweeps across bottom in sync with video */}
          <motion.div
            className="absolute bottom-0 left-0 h-[2px] rounded-full"
            style={{ background: 'linear-gradient(90deg, #E5193A, #FF3B5C)' }}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 5.0, ease: 'linear' }}
          />

          {/* Tap to skip hint */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.0, duration: 0.4 }}
            className="absolute bottom-6 right-6 text-[10px] tracking-widest uppercase"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          >
            tap to skip
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}