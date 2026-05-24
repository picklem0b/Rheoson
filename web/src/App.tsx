import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { router } from './router'
import { useThemeStore } from '@/store/themeStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useMediaSession } from '@/hooks/useMediaSession'
import SplashScreen, { useSplash } from '@/components/ui/SplashScreen'
import { howler } from 'howler'

function AppInner() {
  useKeyboardShortcuts()
  useMediaSession()
  return <RouterProvider router={router} />
}

export default function App() {
  const initTheme       = useThemeStore((s) => s.initTheme)
  const { show, dismiss } = useSplash()

  useEffect(() => {
    const unlock = () => {
      if (Howler.ctx?.state === 'suspended') {
        Howler.ctx.resume()
        
      }
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('click', unlock)
  }
  document.addEventListener('touchstart', unlock, { passive: true })
  document.addEventListener('click', unlock)
  return () => {
    document.removeEventListener('touchstart', unlock)
    document.removeEventListener('click', unlock)
  }
}, [])
  return (
    <>
      <AnimatePresence>
        {show && <SplashScreen onDone={dismiss} />}
      </AnimatePresence>
      {!show && <AppInner />}
    </>
  )
}