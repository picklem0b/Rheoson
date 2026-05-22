import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { useThemeStore } from '@/store/themeStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useMediaSession } from '@/hooks/useMediaSession'

function AppInner() {
  useKeyboardShortcuts()
  useMediaSession()
  return <RouterProvider router={router} />
}

export default function App() {
  const initTheme = useThemeStore((s) => s.initTheme)
  useEffect(() => { initTheme() }, [initTheme])
  return <AppInner />
}