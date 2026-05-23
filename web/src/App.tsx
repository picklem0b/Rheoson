import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { router } from './router'
import { useThemeStore } from '@/store/themeStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useMediaSession } from '@/hooks/useMediaSession'
import SplashScreen, { useSplash } from '@/components/ui/SplashScreen'

function AppInner() {
  useKeyboardShortcuts()
  useMediaSession()
  return <RouterProvider router={router} />
}

export default function App() {
  const initTheme       = useThemeStore((s) => s.initTheme)
  const { show, dismiss } = useSplash()

  useEffect(() => { initTheme() }, [initTheme])

  return (
    <>
      <AnimatePresence>
        {show && <SplashScreen onDone={dismiss} />}
      </AnimatePresence>
      {!show && <AppInner />}
    </>
  )
}