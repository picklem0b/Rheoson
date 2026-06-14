import React, { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster } from '@/components/ui/Toaster'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import PlayerBar from '@/components/player/PlayerBar'
import { usePlayerStore } from '@/store/playerStore'
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
 
const SWIPE_UP_THRESHOLD   = -40
const SWIPE_DOWN_THRESHOLD =  40
const NAV_HIDE_DELAY_MS    = 3000

export default function RootLayout() {
  // Only subscribe to the field we need — avoids re-render on every progress tick
  const hasTrack = usePlayerStore((s) => s.currentTrack !== null)

  const [navVisible, setNavVisible] = useState(true)
  const touchStartY = useRef<number | null>(null)
  const hideTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (hasTrack) {
      hideTimer.current && clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setNavVisible(false), NAV_HIDE_DELAY_MS)
    } else {
      // No track — always show nav
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
      setNavVisible(true)
      if (hasTrack) {
        hideTimer.current && clearTimeout(hideTimer.current)
        hideTimer.current = setTimeout(() => setNavVisible(false), NAV_HIDE_DELAY_MS)
      }
    } else if (deltaY > SWIPE_DOWN_THRESHOLD) {
      setNavVisible(false)
    }
  }

  // Nav height: ~72px. PlayerBar height: var(--player-height, 72px).
  // We only add bottom padding for components that are actually rendered.
  const mobilePb = hasTrack
    ? navVisible
      ? 'pb-[calc(var(--player-height,72px)+72px+env(safe-area-inset-bottom,0px)+0.5rem)]'
      : 'pb-[calc(var(--player-height,72px)+env(safe-area-inset-bottom,0px)+0.5rem)]'
    : 'pb-[calc(72px+env(safe-area-inset-bottom,0px)+0.5rem)]'

  return (
    <Toaster>
      <div className="flex h-full w-full overflow-hidden bg-[var(--bg-base)]">

        {/* ── Sidebar — desktop only ────────────────────── */}
        <aside className="hidden lg:flex flex-shrink-0">
          <Sidebar />
        </aside>

        {/* ── Main content column ───────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          <main
            className={cn(
              'flex-1 overflow-y-auto overflow-x-hidden no-scrollbar',
              // Mobile bottom padding accounts for what's actually rendered
              mobilePb,
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

          {/* PlayerBar desktop — inside column */}
          <div className="hidden lg:block flex-shrink-0">
            <PlayerBar />
          </div>
        </div>

        {/* ── Mobile fixed bottom stack ─────────────────── */}
        <div className="lg:hidden">

          {/* PlayerBar — only rendered + positioned when a track exists */}
          <AnimatePresence>
            {hasTrack && (
              <motion.div
                key="mobile-player"
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0,  opacity: 1 }}
                exit={{   y: 80, opacity: 0  }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed inset-x-0 z-50"
                style={{
                  bottom: navVisible
                    ? 'calc(72px + env(safe-area-inset-bottom, 0px))'
                    : 'env(safe-area-inset-bottom, 0px)',
                  transition: 'bottom 0.35s cubic-bezier(0.32,0,0.67,0)',
                }}
              >
                {/* PlayerBar already returns null if no track, but hasTrack
                    gate here prevents the wrapper div from taking up space */}
                <PlayerBar />
              </motion.div>
            )}
          </AnimatePresence>

          {/* BottomNav */}
          <AnimatePresence>
            {navVisible && (
              <motion.nav
                key="bottom-nav"
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0,   opacity: 1 }}
                exit={{   y: 100, opacity: 0  }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 z-40 px-3"
                style={{
                  paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                }}
              >
                <BottomNav />
              </motion.nav>
            )}
          </AnimatePresence>

          {/* Swipe hint pill when nav is hidden */}
          <AnimatePresence>
            {!navVisible && hasTrack && (
              <motion.div
                key="swipe-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.6 }}
                className="fixed bottom-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
              >
                <div className="w-10 h-1 rounded-full bg-[var(--text-muted)]/30" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </Toaster>
  )
}