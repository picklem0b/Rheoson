import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const LETTERS = ['S','H','U','L','K','E','R']
const SPLASH_KEY = 'shulker-splash-last'
const COOLDOWN_MS = 1000 * 60 * 30   // show every 30 min on reload

export function useSplash() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const last = parseInt(localStorage.getItem(SPLASH_KEY) || '0')
    const now  = Date.now()
    // Show if first visit or it's been > 30min
    if (now - last > COOLDOWN_MS) {
      setShow(true)
      localStorage.setItem(SPLASH_KEY, String(now))
    }
  }, [])

  const dismiss = () => setShow(false)
  return { show, dismiss }
}

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <AnimatePresence>
      <motion.div
        key="splash"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-black"
      >
        {/* Logo mark */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1,   opacity: 1 }}
          transition={{ type: 'spring', damping: 18, stiffness: 200, delay: 0.1 }}
          className="mb-8"
        >
          <div className="w-20 h-20 rounded-[2rem] flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #E5193A, #FF3B5C)' }}>
            <svg viewBox="0 0 40 40" className="w-10 h-10" fill="white">
              <circle cx="20" cy="20" r="8" />
              <path d="M20 4 L20 12 M20 28 L20 36 M4 20 L12 20 M28 20 L36 20"
                    stroke="white" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </div>
        </motion.div>

        {/* SHULKER — wave letters */}
        <div className="flex items-end gap-1">
          {LETTERS.map((letter, i) => (
            <motion.span
              key={i}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: [40, -8, 0], opacity: 1 }}
              transition={{
                delay:    0.3 + i * 0.07,
                duration: 0.6,
                ease:     'easeOut',
              }}
              style={{
                fontFamily:  "'Circular', 'DM Sans', sans-serif",
                fontSize:    '2.5rem',
                fontWeight:  900,
                color:       'white',
                letterSpacing: '0.12em',
                lineHeight:  1,
              }}
            >
              {letter}
            </motion.span>
          ))}
        </div>

        {/* Tagline fade */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.4 }}
          style={{
            color:       'rgba(255,255,255,0.4)',
            fontSize:    '0.75rem',
            marginTop:   '0.75rem',
            letterSpacing: '0.2em',
            fontWeight:  500,
          }}
        >
          MUSIC. DOWNLOADED. PLAYED.
        </motion.p>

        {/* Bottom progress bar */}
        <motion.div
          className="absolute bottom-0 left-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, #E5193A, #FF3B5C)' }}
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: 2.5, ease: 'linear', delay: 0.2 }}
        />
      </motion.div>
    </AnimatePresence>
  )
}