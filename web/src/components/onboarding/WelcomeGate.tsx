import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from '@phosphor-icons/react'

const SEEN_KEY = 'rheoson-welcome-seen'

function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true // storage blocked → never trap the visitor on the welcome screen
  }
}

/**
 * First-visit welcome. One picture, one line, one button — then the app.
 *
 * It replaces the old sign-in wall: nobody is asked for an account here.
 * Account-only actions ask for one later, in context (see AuthCard).
 */
export default function WelcomeGate({ children }: { children: React.ReactNode }) {
  const [seen, setSeen] = useState(hasSeenWelcome)

  if (seen) return <>{children}</>

  const start = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* ignore — worst case the welcome shows again next visit */
    }
    setSeen(true)
  }

  return (
    <div className="relative h-full min-h-screen w-full overflow-hidden bg-black">
      {/* Placeholder artwork — swap /welcome-listening.svg for a photo any time. */}
      <img
        src="/welcome-listening.svg"
        alt="Someone with headphones, eyes closed, listening to music"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" aria-hidden />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
        className="absolute inset-x-0 bottom-0 px-6 pb-[max(32px,env(safe-area-inset-bottom))]"
      >
        <h1 className="max-w-[16ch] text-left text-[32px] font-black leading-[1.1] tracking-tight text-white">
          Let your ears listen to the music they deserve
        </h1>
        <button
          onClick={start}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 text-base font-bold text-white shadow-lg transition-transform active:scale-[0.98]"
        >
          Get started
          <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>
    </div>
  )
}
