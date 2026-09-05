import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
   motion,
   AnimatePresence,
   useMotionValue,
   useTransform
} from "framer-motion";
import {
   ChevronDown,
   Heart,
   MoreHorizontal,
   Download,
   Mic2,
   ListMusic,
   Plus,
   Music2,
   X,
   WifiOff,
   User,
   Users,
   ExternalLink,
   Link as LinkIcon
} from "lucide-react";
import { usePlayerStore } from "@/store/player.store";
import { useUIStore } from "@/store/ui.store";
import { useQueueStore } from "@/store/queue.store";
import { useQueue } from "@/hooks/queue.hook";
import { usePlayer } from "@/hooks/player.hook";
import { useLyrics } from "@/hooks/lyrics.hook";
import { useTrackContextMenu } from "@/hooks/useTrackContextMenu";
import { tracksApi } from "@/api/tracks.api";
import { getArtist } from "@/api/library.api";
import PlayerControls from "@/components/player/PlayerControls";
import ProgressBar from "@/components/player/ProgressBar";
import { Spinner } from "@/components/ui/Spinner";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Track } from "@/types/track.types";

type Tab = "queue" | "lyric" | "creator";

// ── Context menu ──────────────────────────────────────────────

const MENU_ITEMS = [
   { icon: Heart, label: "Like", action: "like" },
   { icon: Download, label: "Download", action: "download" },
   { icon: Plus, label: "Add to queue", action: "queue-add" },
   { icon: LinkIcon, label: "Copy link", action: "copy-link" },
   { icon: Mic2, label: "View lyrics", action: "lyrics" },
   { icon: Music2, label: "Song details", action: "details" }
];

function ContextSheet({
   track,
   liked,
   onClose,
   onAction
}: {
   track: Track;
   liked: boolean;
   onClose: () => void;
   onAction: (action: string) => void;
}) {
   const items = MENU_ITEMS.map(item =>
      item.action === "like"
         ? {
              ...item,
              label: liked ? "Remove from liked" : "Like",
              icon: Heart
           }
         : item
   );

   return (
      <motion.div
         className='absolute inset-0 z-30 flex flex-col justify-end'
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         exit={{ opacity: 0 }}>
         <motion.div
            className='absolute inset-0 bg-black/60 backdrop-blur-sm'
            onClick={onClose}
         />
         <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className='relative z-10 bg-[var(--bg-surface)] rounded-t-3xl overflow-hidden'>
            {/* Header */}
            <div className='flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]'>
               <img
                  src={track.artworkUrl || "/assets/logo.png"}
                  alt={track.title}
                  className='w-12 h-12 rounded-2xl object-cover flex-shrink-0'
                  onError={e => {
                     (e.target as HTMLImageElement).src = "/assets/logo.png";
                  }}
               />
               <div className='min-w-0 flex-1'>
                  <p className='font-bold text-[var(--text-primary)] truncate'>
                     {track.title}
                  </p>
                  <p className='text-sm text-[var(--text-muted)] truncate'>
                     {track.artist?.name ?? 'Unknown Artist'}
                  </p>
               </div>
               <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className='w-8 h-8 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center'>
                  <X className='w-4 h-4 text-[var(--text-muted)]' />
               </motion.button>
            </div>

            <div className='px-2 py-2 pb-safe'>
               {items.map(({ icon: Icon, label, action }) => (
                  <motion.button
                     key={action}
                     whileTap={{ scale: 0.97 }}
                     onClick={() => {
                        onAction(action);
                        onClose();
                     }}
                     className='w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-[var(--bg-elevated)] transition-colors text-left'>
                     <Icon
                        className={cn(
                           "w-5 h-5 flex-shrink-0",
                           action === "like" && liked
                              ? "text-[var(--accent)] fill-current"
                              : "text-[var(--text-secondary)]"
                        )}
                     />
                     <span className='text-sm font-semibold text-[var(--text-primary)]'>
                        {label}
                     </span>
                  </motion.button>
               ))}
            </div>
         </motion.div>
      </motion.div>
   );
}

// ── Lyrics tab ────────────────────────────────────────────────
// Karaoke-style reading view: the active line is highlighted and the
// view auto-follows it while playing (toggleable), and tapping a synced
// line jumps playback to that moment.

function LyricsTab({
   lines,
   activeLine,
   synced,
   isLoading,
   isPlaying,
   onSeek
}: {
   lines: { text: string; startTime?: number }[];
   activeLine: number;
   synced: boolean;
   isLoading: boolean;
   isPlaying: boolean;
   onSeek?: (seconds: number) => void;
}) {
   const [follow, setFollow] = useState(true);
   const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

   // Auto-scroll so the singing line stays centered while playing
   useEffect(() => {
      if (!follow || !synced || !isPlaying) return;
      const el = lineRefs.current[activeLine];
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
   }, [activeLine, follow, synced, isPlaying]);

   if (isLoading) {
      return (
         <div className='flex items-center justify-center py-16'>
            <Spinner size='md' />
         </div>
      );
   }

   if (lines.length === 0) {
      return (
         <div className='flex flex-col items-center justify-center py-16 gap-3 text-center'>
            <Mic2 className='w-10 h-10 text-[var(--text-muted)]' />
            <p className='text-[var(--text-secondary)] font-semibold'>
               No lyrics found
            </p>
            <p className='text-[var(--text-muted)] text-sm'>
               Lyrics aren&apos;t available for this track
            </p>
         </div>
      );
   }

   return (
      <div className='py-4 pb-8'>
         <div className='flex items-center justify-center gap-2 mb-4'>
            {!synced ? (
               <span className='text-[11px] text-[var(--text-muted)] bg-white/5 px-3 py-1 rounded-full'>
                  Static lyrics
               </span>
            ) : (
               <button
                  onClick={() => setFollow(f => !f)}
                  className={cn(
                     "px-3 py-1 rounded-full text-[11px] font-bold transition-colors",
                     follow
                        ? "bg-[var(--accent)] text-white"
                        : "bg-white/5 text-white/50"
                  )}>
                  {follow ? "Following lyrics" : "Auto-scroll off"}
               </button>
            )}
         </div>

         <div className='space-y-4'>
            {lines.map((line, i) => {
               const active = i === activeLine;
               const seekable = synced && typeof line.startTime === "number";
               return (
                  <motion.p
                     key={i}
                     ref={el => {
                        lineRefs.current[i] = el;
                     }}
                     onClick={
                        seekable && onSeek
                           ? () => onSeek((line.startTime as number) / 1000)
                           : undefined
                     }
                     animate={{
                        opacity: active ? 1 : 0.4,
                        scale: active ? 1.03 : 1
                     }}
                     transition={{ duration: 0.25 }}
                     className={cn(
                        "text-lg leading-relaxed text-center transition-all duration-300",
                        seekable && onSeek && "cursor-pointer",
                        active
                           ? "font-bold text-white"
                           : "font-medium text-white/50"
                     )}>
                     {line.text}
                  </motion.p>
               );
            })}
         </div>
      </div>
   );
}

// ── Creator tab ───────────────────────────────────────────────
// Replaces the old "Related — coming soon" stub: shows the artist behind
// the current track — profile, top songs and their reach ("their view").

function compactCount(v: number | string | null | undefined): string {
   const n = typeof v === "string" ? parseInt(v.replace(/,/g, ""), 10) : (v ?? 0);
   if (!n || Number.isNaN(n)) return "";
   if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
   if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
   return String(n);
}

function CreatorTab({
   artistId,
   artistName
}: {
   artistId?: string;
   artistName?: string;
}) {
   const navigate = useNavigate();
   const { playTrack } = useQueue();
   const currentTrack = usePlayerStore(s => s.currentTrack);

   // Remote artists use their YouTube Music browse id; local/unknown ids
   // fall back to the slugged artist name (the backend matches either).
   const browseId =
      artistId && artistId !== "unknown"
         ? artistId
         : artistName
           ? artistName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
           : "";

   const { data, isLoading } = useQuery({
      queryKey: ["artist-content", browseId || "none"],
      queryFn:  () => getArtist(browseId).catch(() => null),
      enabled:  !!browseId,
      staleTime: 10 * 60_000,
      retry:     0
   });

   const artist = data ?? null;
   const top = artist?.topTracks ?? [];
   const listeners =
      artist &&
      ((artist.monthlyListeners ?? 0) > 0
         ? compactCount(artist.monthlyListeners)
         : compactCount(artist.subscribers));

   if (isLoading) {
      return (
         <div className='space-y-2 py-4 pb-8'>
            {Array.from({ length: 4 }).map((_, i) => (
               <div key={i} className='h-14 rounded-2xl bg-white/5 animate-pulse' />
            ))}
         </div>
      );
   }

   return (
      <div className='py-4 pb-8 space-y-5'>
         {/* Profile — the artist's view */}
         {artist ? (
            <>
               <div className='flex items-center gap-3'>
                  {artist.imageUrl ? (
                     <img
                        src={artist.imageUrl}
                        alt={artist.name}
                        className='w-14 h-14 rounded-full object-cover flex-shrink-0'
                        onError={e => {
                           (e.target as HTMLImageElement).src = "/assets/logo.png";
                        }}
                     />
                  ) : (
                     <div className='w-14 h-14 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0'>
                        <User className='w-6 h-6 text-white/50' />
                     </div>
                  )}
                  <div className='min-w-0 flex-1'>
                     <p className='font-bold text-white truncate'>{artist.name}</p>
                     <div className='flex items-center gap-2 mt-1 flex-wrap'>
                        {(artist.genres ?? []).slice(0, 3).map(g => (
                           <span
                              key={g}
                              className='text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/50'>
                              {g}
                           </span>
                        ))}
                        {listeners && (
                           <span className='text-[11px] text-white/40 flex items-center gap-1'>
                              <Users className='w-3 h-3' />
                              {listeners} monthly listeners
                           </span>
                        )}
                     </div>
                  </div>
                  <button
                     onClick={() => navigate(`/artist/${encodeURIComponent(browseId)}`)}
                     className='flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-bold flex-shrink-0'>
                     <ExternalLink className='w-3.5 h-3.5' />
                     Open
                  </button>
               </div>

               {artist.description && (
                  <p className='text-xs text-white/40 leading-relaxed'>{artist.description}</p>
               )}
            </>
         ) : (
            <div className='flex flex-col items-center justify-center py-10 gap-3 text-center'>
               <User className='w-10 h-10 text-white/20' />
               <p className='text-white/60 font-semibold'>
                  {artistName ?? "This artist"}
               </p>
               <p className='text-white/40 text-sm'>
                  Top songs aren&apos;t available for this artist right now
               </p>
            </div>
         )}

         {/* Top songs */}
         {top.length > 0 && (
            <div>
               <p className='text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2 px-1'>
                  Top songs
               </p>
               <div className='space-y-0.5'>
                  {top.map((track: Track, i: number) => (
                     <CreatorTopRow
                        key={`${track.id}-${i}`}
                        track={track}
                        index={i}
                        isCurrent={currentTrack?.id === track.id}
                        onPlay={() => currentTrack?.id !== track.id && playTrack(track, top)}
                     />
                  ))}
               </div>
            </div>
         )}
      </div>
   );
}

// ── Playlist tab ──────────────────────────────────────────────

function PlaylistTab({ currentTrack }: { currentTrack: Track }) {
   const { queue, history, playTrack } = useQueue();
   const all = [...history, currentTrack, ...queue];

   if (all.length === 0) {
      return (
         <div className='flex flex-col items-center justify-center py-16 gap-3 text-center'>
            <ListMusic className='w-10 h-10 text-[var(--text-muted)]' />
            <p className='text-[var(--text-secondary)] font-semibold'>
               Queue is empty
            </p>
         </div>
      );
   }

   return (
      <div className='space-y-1 py-2 pb-8'>
         {all.map((track, i) => {
            const isCurrent = track.id === currentTrack.id;
            return (
               <PlaylistTabRow
                  key={`${track.id}-${i}`}
                  track={track}
                  index={i}
                  isCurrent={isCurrent}
                  onPlay={() => !isCurrent && playTrack(track, all)}
               />
            );
         })}
      </div>
   );
}

// ── Playlist tab row ──────────────────────────────────────────

function PlaylistTabRow({
   track,
   index,
   isCurrent,
   onPlay
}: {
   track: Track;
   index: number;
   isCurrent: boolean;
   onPlay: () => void;
}) {
   const contextMenu = useTrackContextMenu(track);
   return (
      <motion.button
         initial={{ opacity: 0, y: 6 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ delay: Math.min(index * 0.03, 0.3) }}
         whileTap={{ scale: 0.98 }}
         onClick={onPlay}
         {...contextMenu}
         className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left",
            isCurrent
               ? "bg-[var(--accent-subtle)]"
               : "hover:bg-[var(--bg-elevated)]"
         )}>
         <div className='relative flex-shrink-0'>
            <img
               src={track.artworkUrl || "/assets/logo.png"}
               alt={track.title}
               className='w-10 h-10 rounded-xl object-cover'
               onError={e => {
                  (e.target as HTMLImageElement).src =
                     "/assets/logo.png";
               }}
            />
            {track.isDownloaded && (
               <div className='absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[var(--accent)] flex items-center justify-center'>
                  <Download className='w-2 h-2 text-white' />
               </div>
            )}
         </div>
         <div className='flex-1 min-w-0'>
            <p
               className={cn(
                  "text-sm font-semibold truncate",
                  isCurrent
                     ? "text-[var(--accent)]"
                     : "text-[var(--text-primary)]"
               )}>
               {track.title}
            </p>
            <p className='text-xs text-[var(--text-secondary)] truncate'>
               {track.artist?.name ?? 'Unknown Artist'}
            </p>
         </div>
         {isCurrent ? (
            <div className='flex items-end gap-[2px] h-4 flex-shrink-0'>
               {[0, 1, 2].map(j => (
                  <motion.div
                     key={j}
                     className='w-[2px] bg-[var(--accent)] rounded-full'
                     animate={{
                        height: ["40%", "100%", "60%"]
                     }}
                     transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        delay: j * 0.15
                     }}
                  />
               ))}
            </div>
         ) : (
            <span className='text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0'>
               {formatDuration(track.duration)}
            </span>
         )}
      </motion.button>
   );
}

// ── Creator top-song row ──────────────────────────────────────

function CreatorTopRow({
   track,
   index,
   isCurrent,
   onPlay
}: {
   track: Track;
   index: number;
   isCurrent: boolean;
   onPlay: () => void;
}) {
   const contextMenu = useTrackContextMenu(track);
   return (
      <motion.button
         whileTap={{ scale: 0.98 }}
         onClick={onPlay}
         {...contextMenu}
         className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-2xl transition-colors text-left",
            isCurrent
               ? "bg-[var(--accent-subtle)]"
               : "hover:bg-white/5"
         )}>
         <span className='text-xs font-bold text-white/30 w-4 text-center tabular-nums flex-shrink-0'>
            {index + 1}
         </span>
         <div className='relative flex-shrink-0'>
            <img
               src={track.artworkUrl || "/assets/logo.png"}
               alt={track.title}
               className='w-10 h-10 rounded-lg object-cover'
               onError={e => {
                  (e.target as HTMLImageElement).src =
                     "/assets/logo.png";
               }}
            />
         </div>
         <div className='flex-1 min-w-0'>
            <p
               className={cn(
                  "text-sm font-semibold truncate",
                  isCurrent
                     ? "text-[var(--accent)]"
                     : "text-white"
               )}>
               {track.title}
            </p>
            <p className='text-xs text-white/40 truncate'>
               {formatDuration(track.duration)}
            </p>
         </div>
      </motion.button>
   );
}

// ── Main page ─────────────────────────────────────────────────

export default function NowPlaying() {
   const navigate = useNavigate();

   const currentTrack = usePlayerStore(s => s.currentTrack);
   const isPlaying = usePlayerStore(s => s.isPlaying);
   const isLoading = usePlayerStore(s => s.isLoading);
   const { openDownloadModal } = useUIStore();
   const { seek } = usePlayer();

   const {
      lines,
      activeLine,
      synced,
      isLoading: lyricsLoading
   } = useLyrics(currentTrack?.id);

   const [tab, setTab] = useState<Tab>("queue");
   const [showMenu, setShowMenu] = useState(false);
   const [liked, setLiked] = useState(currentTrack?.isLiked ?? false);

   // The PlayerBar lyrics button opens this view on the Lyrics tab
   useEffect(() => {
      const handler = (e: Event) => {
         if ((e as CustomEvent<string>).detail === "lyric") setTab("lyric");
      };
      window.addEventListener("rheoson:show-tab", handler);
      return () => window.removeEventListener("rheoson:show-tab", handler);
   }, []);

   // Swipe-down-to-dismiss
   const dragY = useMotionValue(0);
   const opacity = useTransform(dragY, [0, 200], [1, 0]);
   const scale = useTransform(dragY, [0, 200], [1, 0.94]);

   const handleLike = async () => {
      if (!currentTrack) return;
      const next = !liked;
      setLiked(next);
      try {
         next
            ? await tracksApi.likeTrack(currentTrack.id)
            : await tracksApi.unlikeTrack(currentTrack.id);
      } catch {
         setLiked(!next);
      }
   };

   const handleMenuAction = (action: string) => {
      if (!currentTrack) return;
      switch (action) {
         case "like":
            handleLike();
            break;
         case "download":
            openDownloadModal(currentTrack.id);
            break;
         case "lyrics":
            setTab("lyric");
            break;
         case "queue-add": {
            const { addToQueue } = useQueueStore.getState();
            addToQueue(currentTrack);
            break;
         }
         case "copy-link": {
            const url = `${window.location.origin}/search?q=${encodeURIComponent(currentTrack.title + " " + (currentTrack.artist?.name ?? ''))}`;
            navigator.clipboard.writeText(url).catch(() => {});
            break;
         }
      }
   };

   if (!currentTrack) {
      navigate(-1);
      return null;
   }

   return (
      <motion.div
         style={{ opacity, scale }}
         className='fixed inset-0 z-50 flex flex-col bg-black overflow-hidden'>
         {/* Blurred artwork background */}
         <div className='absolute inset-0 pointer-events-none'>
            <img
               src={currentTrack.artworkUrl || "/assets/logo.png"}
               alt=''
               className='absolute inset-0 w-full h-full object-cover scale-110'
               style={{ filter: "blur(40px)", opacity: 0.35 }}
            />
            <div className='absolute inset-0 bg-gradient-to-b from-black/20 via-black/60 to-black/95' />
         </div>

         {/* Drag-to-dismiss handle */}
         <motion.div
            drag='y'
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            style={{ y: dragY }}
            onDragEnd={(_, info) => {
               if (info.offset.y > 120) navigate(-1);
               else dragY.set(0);
            }}
            className='absolute inset-x-0 top-0 h-12 z-20 flex items-start justify-center pt-2.5 cursor-grab active:cursor-grabbing'>
            <div className='w-10 h-1 rounded-full bg-white/25' />
         </motion.div>

         {/* Scrollable main content */}
         <div className='relative z-10 flex flex-col h-full overflow-y-auto no-scrollbar'>
            {/* Top bar */}
            <div className='flex items-center justify-between px-5 pt-10 pb-2 flex-shrink-0'>
               <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => navigate(-1)}
                  className='w-9 h-9 rounded-full bg-white/10 flex items-center justify-center'>
                  <ChevronDown className='w-5 h-5 text-white' />
               </motion.button>

               <div className='flex items-center gap-2'>
                  {/* Offline badge — shown when track is downloaded */}
                  {currentTrack.isDownloaded && (
                     <div className='flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--accent-subtle)] border border-[var(--accent-border)]'>
                        <WifiOff className='w-3 h-3 text-[var(--accent)]' />
                        <span className='text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider'>
                           Offline
                        </span>
                     </div>
                  )}
                  <p className='text-[10px] font-bold uppercase tracking-widest text-white/50'>
                     Now Playing
                  </p>
               </div>

               <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowMenu(true)}
                  className='w-9 h-9 rounded-full bg-white/10 flex items-center justify-center'>
                  <MoreHorizontal className='w-5 h-5 text-white' />
               </motion.button>
            </div>

            {/* Artwork */}
            <div className='flex-shrink-0 flex items-center justify-center px-8 py-2'>
               <div className='relative w-full max-w-[300px] aspect-square'>
                  <motion.img
                     key={currentTrack.id}
                     src={currentTrack.artworkUrl || "/assets/logo.png"}
                     alt={currentTrack.title}
                     initial={{ opacity: 0, scale: 0.88 }}
                     animate={{
                        opacity: 1,
                        scale: isPlaying ? 1 : 0.94
                     }}
                     transition={{
                        type: "spring",
                        damping: 22,
                        stiffness: 260
                     }}
                     className='w-full h-full rounded-3xl object-cover'
                     style={{
                        boxShadow: isPlaying
                           ? "0 24px 60px rgba(0,0,0,0.7), 0 0 40px var(--accent-subtle)"
                           : "0 12px 30px rgba(0,0,0,0.5)"
                     }}
                     onError={e => {
                        (e.target as HTMLImageElement).src = "/assets/logo.png";
                     }}
                  />

                  {/* Loading overlay */}
                  <AnimatePresence>
                     {isLoading && (
                        <motion.div
                           initial={{ opacity: 0 }}
                           animate={{ opacity: 1 }}
                           exit={{ opacity: 0 }}
                           className='absolute inset-0 rounded-3xl bg-black/50 flex items-center justify-center'>
                           <Spinner size='lg' className='border-white' />
                        </motion.div>
                     )}
                  </AnimatePresence>
               </div>
            </div>

            {/* Track info + like + download */}
            <div className='flex items-center gap-3 px-6 pt-1 pb-2 flex-shrink-0'>
               <div className='flex-1 min-w-0'>
                  <motion.h2
                     key={currentTrack.id}
                     initial={{ opacity: 0, y: 6 }}
                     animate={{ opacity: 1, y: 0 }}
                     className='text-xl font-bold text-white truncate'>
                     {currentTrack.title}
                  </motion.h2>
                  <button
                     onClick={() =>
                        currentTrack.artist?.id &&
                        currentTrack.artist.id !== 'unknown'
                           ? navigate(`/artist/${encodeURIComponent(currentTrack.artist.id)}`)
                           : setTab('creator')
                     }
                     className='text-sm text-white/60 truncate mt-0.5 block max-w-full text-left'>
                     {currentTrack.artist?.name ?? 'Unknown Artist'}
                  </button>
               </div>

               <motion.button whileTap={{ scale: 0.85 }} onClick={handleLike}>
                  <Heart
                     className={cn(
                        "w-6 h-6 transition-colors",
                        liked
                           ? "text-[var(--accent)] fill-current"
                           : "text-white/60"
                     )}
                  />
               </motion.button>

               <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => openDownloadModal(currentTrack.id)}>
                  <Download
                     className={cn(
                        "w-5 h-5 transition-colors",
                        currentTrack.isDownloaded
                           ? "text-[var(--accent)]"
                           : "text-white/60"
                     )}
                  />
               </motion.button>
            </div>

            {/* Progress bar */}
            <div className='px-6 flex-shrink-0'>
               <ProgressBar large />
            </div>

            {/* Controls */}
            <div className='px-4 mt-2 flex-shrink-0 flex justify-center'>
               <PlayerControls large />
            </div>

            {/* Tabs */}
            <div className='flex-shrink-0 px-6 mt-4 border-b border-white/10'>
               <div className='flex gap-6'>
                  {(["queue", "lyric", "creator"] as Tab[]).map(t => (
                     <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                           "pb-3 text-sm font-bold capitalize transition-colors border-b-2 -mb-px",
                           tab === t
                              ? "text-white border-white"
                              : "text-white/40 border-transparent"
                        )}>
                        {t === "queue"
                           ? "Queue"
                           : t === "lyric"
                             ? "Lyrics"
                             : "Creator"}
                     </button>
                  ))}
               </div>
            </div>

            {/* Tab content */}
            <div className='px-6 flex-1'>
               <AnimatePresence mode='wait'>
                  <motion.div
                     key={tab}
                     initial={{ opacity: 0, y: 8 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: -6 }}
                     transition={{ duration: 0.15 }}>
                     {tab === "queue" && (
                        <PlaylistTab currentTrack={currentTrack} />
                     )}
                     {tab === "lyric" && (
                        <LyricsTab
                           lines={lines}
                           activeLine={activeLine}
                           synced={synced}
                           isLoading={lyricsLoading}
                           isPlaying={isPlaying}
                           onSeek={seek}
                        />
                     )}
                     {tab === "creator" && (
                        <CreatorTab
                           artistId={currentTrack.artist?.id}
                           artistName={currentTrack.artist?.name}
                        />
                     )}
                  </motion.div>
               </AnimatePresence>
            </div>
         </div>

         {/* Context menu */}
         <AnimatePresence>
            {showMenu && (
               <ContextSheet
                  track={currentTrack}
                  liked={liked}
                  onClose={() => setShowMenu(false)}
                  onAction={handleMenuAction}
               />
            )}
         </AnimatePresence>
      </motion.div>
   );
}
