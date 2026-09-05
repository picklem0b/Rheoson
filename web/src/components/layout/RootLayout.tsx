import React from "react";
import { Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Toaster } from "@/components/ui/Toaster";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import PlayerBar from "@/components/player/PlayerBar";
import QueuePanel from "@/components/player/QueuePanel";
import { DownloadModal } from "@/components/ui/DownloadModal";
import { AddToPlaylistSheet } from "@/components/playlist/AddToPlaylistSheet";
import { TrackContextMenu } from "@/components/track/TrackContextMenu";
import { usePlayerStore } from "@/store/player.store";
import { useUIStore } from "@/store/ui.store";
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

export default function RootLayout() {
   const hasTrack = usePlayerStore(s => s.currentTrack !== null);
   const navPosition = useUIStore(s => s.navPosition);

   // Nav is always visible — no auto-hide behavior.
   // Position (bottom/top) comes from Settings → Layout → Navigation position.
   const navAtTop = navPosition === 'top';

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
                     // Desktop — player bar card + spacing; never a top nav
                     "lg:pb-[calc(var(--player-height)+8px)] lg:!pt-0",
                     // Mobile — reserve space for the player bar and nav,
                     // laid out according to the chosen nav position
                     navAtTop
                        ? cn(
                             "pt-[calc(var(--nav-height)+8px)]",
                             hasTrack
                                ? "pb-[calc(var(--player-height)+8px)]"
                                : "pb-3"
                          )
                        : cn(
                             hasTrack
                                ? "pb-[calc(var(--player-height)+var(--nav-height)+8px)]"
                                : "pb-[calc(var(--nav-height)+8px)]"
                          )
                  )}
                  >
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
                           // Player bar sits above the BottomNav only when the
                           // nav is docked at the bottom
                           bottom: navAtTop ? 0 : "var(--nav-height)",
                        }}>
                        <PlayerBar />
                     </motion.div>
                  )}
               </AnimatePresence>

               {/* Nav — docked per Settings → Layout → Navigation position */}
               <motion.nav
                  key='bottom-nav'
                  initial={{ y: 0, opacity: 1 }}
                  animate={{ y: 0, opacity: 1 }}
                  className={cn(
                     'fixed inset-x-0 z-40 flex',
                     navAtTop ? 'top-0 items-start' : 'bottom-0 items-end',
                     // Keep the floating pill clear of notches/home bars
                     navAtTop
                        ? 'pt-[env(safe-area-inset-top)]'
                        : 'pb-[env(safe-area-inset-bottom)]'
                  )}
                  style={{ height: "var(--nav-height)" }}>
                  <BottomNav />
               </motion.nav>
            </div>

            {/* ── Queue Panel (slide-in drawer) ─────────────── */}
            <QueuePanel />

            {/* ── Download options modal ─────────────────────── */}
            <DownloadModal />

            {/* ── Add-to-playlist sheet (global) ──────────────── */}
            <AddToPlaylistSheet />

            {/* ── Universal track context menu (right-click / long-press) ── */}
            <TrackContextMenu />
         </div>
      </Toaster>
   );
}
