import React, { useRef } from "react";
import { Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Toaster } from "@/components/ui/Toaster";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import PlayerBar from "@/components/player/PlayerBar";
import QueuePanel from "@/components/player/QueuePanel";
import { usePlayerStore } from "@/store/player.store";
import { cn } from "@/lib/utils";

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

const SWIPE_UP_THRESHOLD = -36;
const SWIPE_DOWN_THRESHOLD = 36;

/**
 * BottomNav auto-hide is DISABLED.
 * The nav stays visible at all times — no cooldown timer, no swipe-to-hide.
 * Users always have access to navigation without needing to swipe.
 */

export default function RootLayout() {
   const hasTrack = usePlayerStore(s => s.currentTrack !== null);

   // Nav is always visible — no auto-hide behavior
   const navVisible = true;
   const touchStartY = useRef<number | null>(null);

   // Touch handlers kept as no-ops for future gesture support
   const onTouchStart = (e: React.TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
   };

   const onTouchEnd = (e: React.TouchEvent) => {
      touchStartY.current = null;
   };

   return (
      <Toaster>
         <div className='flex h-full w-full overflow-hidden bg-[var(--bg-base)]'>
            {/* ── Desktop sidebar ───────────────────────────── */}
            <aside className='hidden lg:flex flex-shrink-0'>
               <Sidebar />
            </aside>

            {/* ── Content column ────────────────────────────── */}
            <div className='flex flex-col flex-1 min-w-0 overflow-hidden'>
               <main
                  className={cn(
                     "flex-1 overflow-y-auto overflow-x-hidden no-scrollbar",
                     // Desktop — player bar card + spacing
                     "lg:pb-[calc(var(--player-height)+8px)]",
                     // Mobile — player bar + nav (when both visible)
                     // Using CSS variable approach avoids Tailwind purging dynamic strings
                     hasTrack &&
                        navVisible &&
                        "pb-[calc(var(--player-height)+var(--nav-height)+8px)]",
                     hasTrack &&
                        !navVisible &&
                        "pb-[calc(var(--player-height)+8px)]",
                     !hasTrack && "pb-[calc(var(--nav-height)+8px)]",
                     // Remove mobile padding on desktop
                     "lg:!pb-[var(--player-height)]"
                  )}
                  onTouchStart={onTouchStart}
                  onTouchEnd={onTouchEnd}>
                  <div className='page-enter h-full'>
                     <Outlet />
                  </div>
               </main>

               {/* Desktop PlayerBar — floating card at bottom */}
               <div className='hidden lg:block flex-shrink-0'>
                  <PlayerBar />
               </div>
            </div>

            {/* ── Mobile fixed overlay stack ─────────────────── */}
            <div className='lg:hidden'>
               {/* PlayerBar — only in DOM when track exists */}
               <AnimatePresence>
                  {hasTrack && (
                     <motion.div
                        key='player-bar'
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        transition={{
                           type: "spring",
                           damping: 28,
                           stiffness: 300
                        }}
                        className='fixed inset-x-0 z-50'
                        style={{
                           // Player bar sits above the BottomNav
                           bottom: "var(--nav-height)",
                        }}>
                        <PlayerBar />
                     </motion.div>
                  )}
               </AnimatePresence>

               {/* BottomNav — always visible, raised slightly from bottom */}
               <motion.nav
                  key='bottom-nav'
                  initial={{ y: 0, opacity: 1 }}
                  animate={{ y: 0, opacity: 1 }}
                  className='fixed inset-x-0 bottom-0 z-40 flex items-end'
                  style={{ height: "var(--nav-height)" }}>
                  <BottomNav />
               </motion.nav>
            </div>

            {/* ── Queue Panel (slide-in drawer) ─────────────── */}
            <QueuePanel />
         </div>
      </Toaster>
   );
}
