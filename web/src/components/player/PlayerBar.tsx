import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, DotsThreeOutline, Queue, Microphone, DownloadSimple, WifiSlash, SlidersHorizontal } from '@phosphor-icons/react';
import { usePlayerStore } from "@/store/player.store";
import { useTrackContextMenu } from "@/hooks/useTrackContextMenu";
import { useUIStore } from "@/store/ui.store";
import { tracksApi } from "@/api/tracks.api";
import PlayerControls from "./PlayerControls";
import ProgressBar from "./ProgressBar";
import VolumeControl from "./VolumeControl";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { truncate } from "@/lib/formatters";
import { invalidateLikeSurfaces } from "@/lib/queryInvalidation";

export default function PlayerBar() {
   const navigate = useNavigate();
   const queryClient = useQueryClient();
   const currentTrack = usePlayerStore(s => s.currentTrack);
   const isPlaying = usePlayerStore(s => s.isPlaying);
   const isLoading = usePlayerStore(s => s.isLoading);
   const {
      showQueue,
      toggleQueue,
      openDownloadModal
   } = useUIStore();

   // Lyrics lives in the full-player view (Lyrics tab) — open it there.
   const openLyrics = useCallback(() => {
      navigate("/full-player");
      window.dispatchEvent(
         new CustomEvent("rheoson:show-tab", { detail: "lyric" })
      );
   }, [navigate]);

   // Local liked state — kept in sync with the track's isLiked flag.
   const [liked, setLiked] = useState(currentTrack?.isLiked ?? false);
   const [menuOpen, setMenuOpen] = useState(false);
   const menuRef = useRef<HTMLDivElement>(null);

   // Sync liked state whenever the track changes
   useEffect(() => {
      setLiked(currentTrack?.isLiked ?? false);
   }, [currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- sync liked when track changes only

   // Close menu on outside click
   useEffect(() => {
      if (!menuOpen) return;
      const handler = (e: MouseEvent) => {
         if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
   }, [menuOpen]);

   const handleLike = useCallback(
      async (e: React.MouseEvent) => {
         e.stopPropagation();
         if (!currentTrack) return;
         const next = !liked;
         setLiked(next);
         try {
            next
               ? await tracksApi.likeTrack(currentTrack.id)
               : await tracksApi.unlikeTrack(currentTrack.id);
            // Every surface showing this track's like state, not just this one.
            invalidateLikeSurfaces(queryClient);
         } catch {
            setLiked(!next); // revert on failure
         }
      }, [currentTrack?.id, liked]); // eslint-disable-line react-hooks/exhaustive-deps -- track ID change is sufficient

   const { toast } = useToast();

   // Tell the user when autoplay kicked in at the end of the queue
   useEffect(() => {
      const handler = (e: Event) => {
         const d = (e as CustomEvent<{ title?: string; count?: number }>).detail;
         toast(
            `Autoplaying similar music — ${truncate(d?.title ?? "", 22)}`,
            "info",
            3000
         );
      };
      window.addEventListener("rheoson:autoplay-started", handler);
      return () =>
         window.removeEventListener("rheoson:autoplay-started", handler);
   }, [toast]);

   // Universal context menu on the track info area (right-click / long-press)
   const contextMenu = useTrackContextMenu(currentTrack);

   if (!currentTrack) return null;

   return (
      <AnimatePresence>
         <motion.div
            key='player-bar'
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className='relative z-30 w-full px-2 pb-1 pt-0.5'>
            {/* Floating rounded card.
                NOTE: intentionally NOT `overflow-hidden` — the card used to clip
                the three-dot overflow menu (which opens upward from inside it),
                so the menu was invisible behind the bar. The two absolutely
                positioned decorations below carry their own clipping instead. */}
            <div
               className='glass relative rounded-3xl mx-1'
               style={{
                  boxShadow: isPlaying
                     ? "inset 0 1px 0 var(--glass-highlight), 0 -4px 24px var(--accent-subtle), var(--shadow-lg)"
                     : "inset 0 1px 0 var(--glass-highlight), var(--shadow-lg)"
               }}>
               {/* Subtle accent glow line at top when playing */}
               {isPlaying && (
                  <div className='absolute top-0 inset-x-0 h-[1px] overflow-hidden rounded-t-3xl'>
                     <div className='w-full h-full bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-60' />
                  </div>
               )}

               {/* Thin progress line at very top of card */}
               <div className='absolute top-0 inset-x-0 overflow-hidden rounded-t-3xl'>
                  <ProgressBar compact />
               </div>

               <div className='flex items-center gap-3 px-4 py-2.5'>
                  {/* Track info → taps to Now Playing; right-click /
                      long-press opens the universal context menu */}
                  <motion.button
                     whileTap={{ scale: 0.97 }}
                     onClick={() => navigate("/full-player")}
                     {...contextMenu}
                     className='flex items-center gap-3 flex-1 min-w-0 text-left'>
                     {/* Artwork */}
                     <div className='relative flex-shrink-0'>
                        <motion.img
                           key={currentTrack.artworkUrl}
                           src={currentTrack.artworkUrl || "/assets/logo.png"}
                           alt={currentTrack.title}
                           className='w-12 h-12 rounded-2xl object-cover shadow-lg'
                           initial={{ opacity: 0, scale: 0.85 }}
                           animate={{ opacity: 1, scale: 1 }}
                           transition={{ type: "spring", damping: 20 }}
                           onError={e => {
                              (e.target as HTMLImageElement).src =
                                 "/assets/logo.png";
                           }}
                        />

                        {/* Loading pulse */}
                        {isLoading && (
                           <div className='absolute inset-0 rounded-2xl border-2 border-[var(--accent)] animate-pulse' />
                        )}

                        {/* Offline badge (downloaded) */}
                        {!isLoading && currentTrack.isDownloaded && (
                           <div className='absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--accent)] flex items-center justify-center'>
                              <WifiSlash className='w-2 h-2 text-white' />
                           </div>
                        )}

                        {/* EQ animation (playing, not downloaded) */}
                        {!isLoading &&
                           isPlaying &&
                           !currentTrack.isDownloaded && (
                              <div className='absolute -bottom-0.5 -right-0.5 flex items-end gap-[2px] bg-[var(--accent)] rounded-md px-[3px] py-[2px]'>
                                 <span className='eq-bar h-[6px]' />
                                 <span className='eq-bar h-[8px]' />
                                 <span className='eq-bar h-[5px]' />
                              </div>
                           )}
                     </div>

                     {/* Title + artist */}
                     <div className='min-w-0'>
                        <p className='text-sm font-semibold text-[var(--text-primary)] truncate leading-tight'>
                           {truncate(currentTrack.title, 28)}
                        </p>
                        <p className='text-xs text-[var(--text-secondary)] truncate leading-tight mt-0.5'>
                           {truncate(currentTrack.artist?.name ?? 'Unknown Artist', 22)}
                        </p>
                     </div>
                  </motion.button>

                  {/* Like button */}
                  <motion.button
                     whileTap={{ scale: 0.8 }}
                     onClick={handleLike}
                     aria-label={liked ? "Remove from liked" : "Like song"}
                     className='flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center active:bg-[var(--bg-elevated)]'>
                     <Heart
                        className={cn(
                           "w-4 h-4 transition-all duration-200",
                           liked
                              ? "text-[var(--accent)] fill-current"
                              : "text-[var(--text-muted)]"
                        )}
                     />
                  </motion.button>

                  {/* Centre controls (desktop) */}
                  <div className='hidden sm:flex items-center'>
                     <PlayerControls />
                  </div>

                  {/* Play/pause only (mobile) */}
                  <div className='flex sm:hidden items-center'>
                     <PlayerControls mobileOnly />
                  </div>

                  {/* Right actions (desktop only) */}
                  <div className='hidden md:flex items-center gap-1 flex-shrink-0'>
                     <VolumeControl />
                     <IconButton
                        size='sm'
                        variant='ghost'
                        onClick={openLyrics}
                        title='Lyrics'>
                        <Microphone />
                     </IconButton>
                     <IconButton
                        size='sm'
                        variant='ghost'
                        active={showQueue}
                        onClick={toggleQueue}
                        title='Queue'>
                        <Queue />
                     </IconButton>
                  </div>

                  {/* Three-dot overflow menu */}
                  <div className='relative z-40 flex-shrink-0' ref={menuRef}>
                     <IconButton
                        size='sm'
                        variant='ghost'
                        onClick={e => {
                           e.stopPropagation();
                           setMenuOpen(!menuOpen);
                        }}>
                        <DotsThreeOutline />
                     </IconButton>

                     <AnimatePresence>
                        {menuOpen && (
                           <motion.div
                              initial={{ opacity: 0, scale: 0.9, y: 8 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9, y: 8 }}
                              transition={{
                                 type: "spring",
                                 damping: 25,
                                 stiffness: 350
                              }}
                              className='absolute bottom-full right-0 mb-2 z-[100] w-52 glass-strong rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden'>
                              {[
                                 {
                                    label: liked
                                       ? "Remove from liked"
                                       : "Like song",
                                    icon: (
                                       <Heart
                                          className={cn(
                                             "w-4 h-4",
                                             liked &&
                                                "fill-current text-[var(--accent)]"
                                          )}
                                       />
                                    ),
                                    action: (e: React.MouseEvent) => {
                                       handleLike(e);
                                       setMenuOpen(false);
                                    }
                                 },
                                 {
                                    label: "Download",
                                    icon: <DownloadSimple className='w-4 h-4' />,
                                    action: () => {
                                       openDownloadModal(currentTrack.id, currentTrack);
                                       setMenuOpen(false);
                                    }
                                 },
                                 {
                                    label: "View lyrics",
                                    icon: <Microphone className='w-4 h-4' />,
                                    action: () => {
                                       openLyrics();
                                       setMenuOpen(false);
                                    }
                                 },
                                 {
                                    label: "Playback settings",
                                    icon: <SlidersHorizontal className='w-4 h-4' />,
                                    action: () => {
                                       setMenuOpen(false);
                                       window.dispatchEvent(
                                          new CustomEvent("rheoson:playback-settings")
                                       );
                                    }
                                 },
                                 {
                                    label: showQueue
                                       ? "Hide queue"
                                       : "Show queue",
                                    icon: <Queue className='w-4 h-4' />,
                                    action: () => {
                                       toggleQueue();
                                       setMenuOpen(false);
                                    }
                                 }
                              ].map(item => (
                                 <motion.button
                                    key={item.label}
                                    whileHover={{
                                       backgroundColor: "var(--bg-elevated)"
                                    }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={item.action as (e: React.MouseEvent) => void}
                                    className='w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--border)] last:border-0 transition-colors'>
                                    <span className='text-[var(--text-muted)]'>
                                       {item.icon}
                                    </span>
                                    <span className='text-sm font-medium text-[var(--text-primary)]'>
                                       {item.label}
                                    </span>
                                 </motion.button>
                              ))}
                           </motion.div>
                        )}
                     </AnimatePresence>
                  </div>
               </div>
            </div>
         </motion.div>
      </AnimatePresence>
   );
}
