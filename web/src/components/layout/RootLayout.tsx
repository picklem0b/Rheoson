import { useRef, useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster } from '@/components/ui/Toaster'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import PlayerBar from '@/components/player/PlayerBar'
import { usePlayerStore } from '@/store/playerStore'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'

/**
 * Mobile layout stack (bottom → top in z-order):
 *
 *  ┌─────────────────────────────┐  ← page content (scrollable)
 *  │                             │
 *  │         <Outlet />          │
 *  │                             │
 *  ├─────────────────────────────┤
 *  │         PlayerBar           │  ← always visible when track loaded
 *  ├─────────────────────────────┤
 *  │         BottomNav           │  ← visible by default; hides behind
 *  └─────────────────────────────┘    PlayerBar when track plays, swipe-up restores
 *
 * Desktop (lg+):
 *  Sidebar on left, no BottomNav, PlayerBar pinned at bottom of content column.
 */

const SWIPE_UP_THRESHOLD   = -40  // px — swipe up this far to show nav
const SWIPE_DOWN_THRESHOLD =  40  // px — swipe down this far to hide nav
const NAV_HIDE_DELAY_MS    = 3000 // hide nav automatically after this long

export default function RootLayout() {
  const hasTrack = usePlayerStore((s) => s.currentTrack !== null)

  // Whether the bottom nav is visible on mobile
  const [navVisible, setNavVisible] = useState(true)

  // Touch tracking for swipe gesture
  const touchStartY  = useRef<number | null>(null)
  const hideTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // When a track starts playing, auto-hide nav after a delay
  useEffect(() => {
    if (hasTrack) {
      hideTimer.current && clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setNavVisible(false), NAV_HIDE_DELAY_MS)
    } else {
      setNavVisible(true)
    }
    return () => { hideTimer.current && clearTimeout(hideTimer.current) }
  }, [hasTrack])

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return
    const deltaY = e.changedTouches[0].clientY - touchStartY.current
    touchStartY.current = null

    if (deltaY < SWIPE_UP_THRESHOLD) {
      // Swipe up → show nav
      setNavVisible(true)
      // Auto-hide again after delay if a track is playing
      if (hasTrack) {
        hideTimer.current && clearTimeout(hideTimer.current)
        hideTimer.current = setTimeout(() => setNavVisible(false), NAV_HIDE_DELAY_MS)
      }
    } else if (deltaY > SWIPE_DOWN_THRESHOLD) {
      // Swipe down → hide nav
      setNavVisible(false)
    }
  }

  return (
    <Toaster>
      <div className="flex h-full w-full overflow-hidden bg-[var(--bg-base)]">

        {/* ── Sidebar — desktop only ────────────────────────── */}
        <aside className="hidden lg:flex flex-shrink-0">
          <Sidebar />
        </aside>

        {/* ── Main content column ───────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Page content — padded so it never hides under PlayerBar / BottomNav */}
          <main
            className={cn(
              'flex-1 overflow-y-auto overflow-x-hidden no-scrollbar',
              // Mobile: reserve space for PlayerBar + BottomNav
              'pb-[calc(var(--player-height,72px)+var(--nav-height,72px)+env(safe-area-inset-bottom,0px)+0.5rem)]',
              // Desktop: only PlayerBar
              'lg:pb-[calc(var(--player-height,72px)+1rem)]',
            )}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div className="page-enter h-full">
              <Outlet />
            </div>
          </main>

          {/* ── PlayerBar — desktop (pinned inside column) ─── */}
          <div className="hidden lg:block flex-shrink-0">
            <PlayerBar />
          </div>
        </div>

        {/* ── Mobile fixed bottom stack ─────────────────────── */}
        {/*
          Rendered outside the column so it overlays on mobile.
          Order in DOM (bottom of z-stack to top):
            1. BottomNav   (z-40, slides down when hidden)
            2. PlayerBar   (z-50, always above nav)
        */}
        <div className="lg:hidden">

          {/* PlayerBar — sits directly above the nav */}
          <div className="fixed inset-x-0 z-50"
               style={{
                 bottom: navVisible
                   ? 'calc(var(--nav-height, 72px) + env(safe-area-inset-bottom, 0px))'
                   : 'env(safe-area-inset-bottom, 0px)',
                 transition: 'bottom 0.35s cubic-bezier(0.32, 0, 0.67, 0)',
               }}
          >
            <PlayerBar />
          </div>

          {/* BottomNav — slides up/down */}
          <AnimatePresence>
            {navVisible && (
              <motion.nav
                key="bottom-nav"
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0,   opacity: 1 }}
                exit={{   y: 100, opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-safe"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}
              >
                <BottomNav />
              </motion.nav>
            )}
          </AnimatePresence>

          {/* Swipe hint — tiny pill shown when nav is hidden */}
          <AnimatePresence>
            {!navVisible && hasTrack && (
              <motion.div
                key="swipe-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.5 }}
                className="fixed bottom-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
              >
                <div className="w-10 h-1 rounded-full bg-[var(--text-muted)]/40" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </Toaster>
  )
}