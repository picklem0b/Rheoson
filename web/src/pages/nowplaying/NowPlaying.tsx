import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
   motion,
   AnimatePresence
} from "framer-motion";
import {
   CaretDown,
   CaretRight,
   Heart,
   DotsThreeOutline,
   DownloadSimple,
   Microphone,
   Queue,
   Plus,
   Play,
   MusicNotes,
   X,
   WifiSlash,
   User,
   Users,
   SealCheck,
   Info,
   Link as LinkIcon
} from '@phosphor-icons/react';
import { usePlayerStore } from "@/store/player.store";
import { useUIStore } from "@/store/ui.store";
import { useQueueStore } from "@/store/queue.store";
import { useAuthStore } from "@/store/auth.store";
import { useQueue } from "@/hooks/queue.hook";
import { usePlayer } from "@/hooks/player.hook";
import { useLyrics } from "@/hooks/lyrics.hook";
import { useTrackContextMenu } from "@/hooks/useTrackContextMenu";
import { tracksApi } from "@/api/tracks.api";
import { invalidateLikeSurfaces } from "@/lib/queryInvalidation";
import {
   getArtist,
   getFollowStatus,
   followArtist,
   unfollowArtist
} from "@/api/library.api";
import { qk } from "@/lib/queryKeys";
import { invalidateArtistFollowSurfaces } from "@/lib/queryInvalidation";
import PlayerControls from "@/components/player/PlayerControls";
import ProgressBar from "@/components/player/ProgressBar";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Track } from "@/types/track.types";

type Tab = "queue" | "lyric" | "creator";

// ── Context menu ──────────────────────────────────────────────

const MENU_ITEMS = [
   { icon: Heart, label: "Favourite", action: "like" },
   { icon: DownloadSimple, label: "Download", action: "download" },
   { icon: Plus, label: "Add to queue", action: "queue-add" },
   { icon: LinkIcon, label: "Copy link", action: "copy-link" },
   { icon: Microphone, label: "View lyrics", action: "lyrics" }
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
              label: liked ? "Remove from favourites" : "Favourite",
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
   lines: { text: string; time?: number }[];
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
         <div className='flex items-end justify-center py-16 gap-1 h-fit' role='status' aria-label='Loading lyrics'>
            {[0, 1, 2].map(i => (
               <motion.span
                  key={i}
                  className='w-1.5 bg-[var(--accent)] rounded-full h-6 origin-bottom'
                  animate={{ scaleY: [0.3, 1, 0.6] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
               />
            ))}
         </div>
      );
   }

   if (lines.length === 0) {
      return (
         <div className='flex flex-col items-center justify-center py-16 gap-3 text-center'>
            <Microphone className='w-10 h-10 text-[var(--text-muted)]' />
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
               const seekable = synced && typeof line.time === "number";
               return (
                  <motion.p
                     key={i}
                     ref={el => {
                        lineRefs.current[i] = el;
                     }}
                     onClick={
                        seekable && onSeek
                           ? () => onSeek((line.time as number) / 1000)
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
// The creator behind the current track: who they are, how far their music
// reaches, and enough of their catalogue to keep listening without leaving
// the player. Lyrics live only in the Lyrics tab, so this surface carries
// identity and songs rather than a second copy of the same words.
//
// Follow state is optimistic. The button flips on tap and reverts only if
// the request actually fails, because a follow that silently does nothing
// (guest session, no signal) is worse than one that visibly refuses.

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
   // Bio is tucked behind an (i) icon — the tab leads with the artist,
   // not a wall of text.
   const [showBio, setShowBio] = useState(false);
   const navigate = useNavigate();
   const isAuthenticated = useAuthStore(s => s.isAuthenticated);

   // Remote artists use their YouTube Music browse id; local/unknown ids
   // fall back to the slugged artist name (the backend matches either).
   const browseId =
      artistId && artistId !== "unknown"
         ? artistId
         : artistName
           ? artistName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
           : "";

   const queryClient = useQueryClient();
   const { playAll, playTrack } = useQueue();

   const { data, isLoading } = useQuery({
      queryKey: qk.artistContent(browseId || "none"),
      queryFn:  () => getArtist(browseId).catch(() => null),
      enabled:  !!browseId,
      staleTime: 10 * 60_000,
      retry:     0
   });

   // Follow status is per-user, so it is only asked for when signed in.
   const { data: followStatus, refetch: refetchFollow } = useQuery({
      queryKey: qk.artistFollow(browseId || "none"),
      queryFn:  () => getFollowStatus(browseId).catch(() => null),
      enabled:  !!browseId && isAuthenticated,
      staleTime: 60_000,
      retry:     0
   });

   // Optimistic overlay: null means "show whatever the server last said".
   const [pendingFollow, setPendingFollow] = useState<boolean | null>(null);
   const [followBusy, setFollowBusy] = useState(false);
   const isFollowing = pendingFollow ?? followStatus?.isFollowing ?? false;

   const toggleFollow = async () => {
      if (!browseId || !isAuthenticated || followBusy) return;
      setFollowBusy(true);
      const next = !isFollowing;
      setPendingFollow(next);
      try {
         if (next) {
            await followArtist(browseId, {
               name: artist?.name ?? artistName,
               imageUrl: artist?.imageUrl,
               monthlyListeners: artist?.monthlyListeners
            });
         } else {
            await unfollowArtist(browseId);
         }
         // A follow is visible elsewhere (the following list, the artist page).
         invalidateArtistFollowSurfaces(queryClient, browseId);
         await refetchFollow();
      } catch {
         // Reverted below — the server stays the source of truth.
      } finally {
         setPendingFollow(null);
         setFollowBusy(false);
      }
   };

   const artist = data ?? null;
   const listeners =
      artist &&
      ((artist.monthlyListeners ?? 0) > 0
         ? compactCount(artist.monthlyListeners)
         : compactCount(artist.subscribers));

   const topTracks = (artist?.topTracks ?? []).slice(0, 5);
   // Albums before singles — a release decade reads as a discography, a
   // singles wall reads as a feed.
   const releases = [
      ...(artist?.albums ?? []).map(a => ({ ...a, kind: "album" as const })),
      ...(artist?.singles ?? []).map(a => ({ ...a, kind: "single" as const }))
   ].slice(0, 8);
   const hasCatalogue = topTracks.length > 0 || releases.length > 0;

   if (isLoading) {
      return (
         <div className='space-y-3 py-4 pb-8'>
            <div className='flex items-center gap-3'>
               <div className='h-14 w-14 rounded-full bg-white/5 animate-pulse' />
               <div className='flex-1 space-y-2'>
                  <div className='h-4 w-40 rounded-full bg-white/5 animate-pulse' />
                  <div className='h-3 w-24 rounded-full bg-white/5 animate-pulse' />
               </div>
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
               <div key={i} className='h-12 rounded-xl bg-white/5 animate-pulse' />
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
                     <button
                        onClick={() =>
                           navigate(`/artist/${encodeURIComponent(browseId)}`)
                        }
                        className='flex items-center gap-1.5 min-w-0 max-w-full'>
                        <span className='font-bold text-white truncate'>
                           {artist.name}
                        </span>
                        <SealCheck className='w-4 h-4 text-[var(--accent)] flex-shrink-0' />
                     </button>
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
                  {isAuthenticated && (
                     <motion.button
                        whileTap={{ scale: 0.94 }}
                        disabled={followBusy}
                        onClick={toggleFollow}
                        className={cn(
                           "px-4 py-1.5 rounded-full text-xs font-bold flex-shrink-0 border transition-colors disabled:opacity-60",
                           isFollowing
                              ? "border-white/25 text-white/80"
                              : "bg-white text-black border-white"
                        )}>
                        {isFollowing ? "Following" : "Follow"}
                     </motion.button>
                  )}
               </div>

               {artist.description && (
                  <div className='px-1'>
                     <button
                        onClick={() => setShowBio(v => !v)}
                        aria-label={showBio ? 'Hide artist info' : 'About this artist'}
                        className='flex items-center gap-1.5 text-[11px] font-semibold text-white/40 transition-colors hover:text-white/70'>
                        <Info className='w-3.5 h-3.5' />
                        About
                     </button>
                     {showBio && (
                        <p className='mt-1.5 text-xs text-white/40 leading-relaxed'>
                           {artist.description}
                        </p>
                     )}
                  </div>
               )}
            </>
         ) : (
            <div className='flex items-center gap-3'>
               <div className='w-14 h-14 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0'>
                  <User className='w-6 h-6 text-white/50' />
               </div>
               <div className='min-w-0 flex-1'>
                  <p className='font-bold text-white truncate'>
                     {artistName ?? "This artist"}
                  </p>
                  <p className='text-[11px] text-white/40'>
                     No profile available for this artist
                  </p>
               </div>
               {browseId && (
                  <button
                     onClick={() =>
                        navigate(`/artist/${encodeURIComponent(browseId)}`)
                     }
                     className='flex-shrink-0 rounded-full border border-white/25 px-4 py-1.5 text-xs font-bold text-white/80 transition-colors hover:text-white'>
                     Open
                  </button>
               )}
            </div>
         )}

         {/* Popular — the songs people actually start with. */}
         {topTracks.length > 0 && (
            <div>
               <div className='mb-1.5 flex items-center justify-between px-1'>
                  <h3 className='text-[11px] font-bold uppercase tracking-widest text-white/50'>
                     Popular
                  </h3>
                  <button
                     onClick={() => playAll(topTracks)}
                     className='rounded-full px-3 py-1 text-[11px] font-bold text-white/60 transition-colors hover:text-white'>
                     Play all
                  </button>
               </div>
               <div className='space-y-0.5'>
                  {topTracks.map((track, i) => (
                     <CreatorTrackRow
                        key={track.id}
                        track={track}
                        index={i}
                        onPlay={() => playTrack(track, topTracks)}
                     />
                  ))}
               </div>
            </div>
         )}

         {/* Releases — the discography, newest first. */}
         {releases.length > 0 && (
            <div>
               <h3 className='mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-white/50'>
                  Releases
               </h3>
               <div className='flex gap-3 overflow-x-auto pb-1 no-scrollbar'>
                  {releases.map(release => (
                     <button
                        key={release.id}
                        onClick={() => navigate(`/album/${release.id}`)}
                        className='w-28 flex-shrink-0 text-left'>
                        <div className='mb-1.5 aspect-square w-full overflow-hidden rounded-xl bg-white/5'>
                           {release.artworkUrl && (
                              <img
                                 src={release.artworkUrl}
                                 alt={release.title}
                                 loading='lazy'
                                 className='h-full w-full object-cover'
                                 onError={e => {
                                    (e.target as HTMLImageElement).src =
                                       "/assets/logo.png";
                                 }}
                              />
                           )}
                        </div>
                        <p className='truncate text-xs font-semibold text-white'>
                           {release.title}
                        </p>
                        <p className='text-[10px] text-white/40'>
                           {release.kind === "single" ? "Single" : "Album"}
                           {release.releaseYear > 0
                              ? ` · ${release.releaseYear}`
                              : ""}
                        </p>
                     </button>
                  ))}
               </div>
            </div>
         )}

         {/* The tab is a summary; the full page carries the rest. */}
         {artist && hasCatalogue && (
            <button
               onClick={() => navigate(`/artist/${encodeURIComponent(browseId)}`)}
               className='flex w-full items-center justify-center gap-1.5 rounded-full border border-white/15 py-2.5 text-xs font-bold text-white/70 transition-colors hover:text-white'>
               View full artist profile
               <CaretRight className='h-3.5 w-3.5' />
            </button>
         )}
      </div>
   );
}

// ── Creator tab rows ──────────────────────────────────────────

function CreatorTrackRow({
   track,
   index,
   onPlay
}: {
   track: Track;
   index: number;
   onPlay: () => void;
}) {
   const contextMenu = useTrackContextMenu(track);
   return (
      <motion.button
         whileTap={{ scale: 0.98 }}
         onClick={onPlay}
         {...contextMenu}
         className='group flex w-full items-center gap-3 rounded-xl px-1.5 py-2 text-left transition-colors hover:bg-white/5'>
         <span className='w-5 text-center text-xs tabular-nums text-white/40 group-hover:hidden'>
            {index + 1}
         </span>
         <Play className='hidden h-4 w-4 fill-current text-white group-hover:block' />
         {track.artworkUrl ? (
            <img
               src={track.artworkUrl}
               alt={track.title}
               loading='lazy'
               className='h-10 w-10 flex-shrink-0 rounded-lg object-cover'
            />
         ) : (
            <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/5'>
               <MusicNotes className='h-4 w-4 text-white/40' />
            </div>
         )}
         <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-semibold text-white'>
               {track.title}
            </p>
            <p className='truncate text-xs text-white/40'>
               {track.album?.title ?? 'Single'}
            </p>
         </div>
         <span className='flex-shrink-0 text-xs tabular-nums text-white/40'>
            {formatDuration(track.duration)}
         </span>
      </motion.button>
   );
}

// ── Playlist tab ──────────────────────────────────────────────

function PlaylistTab({ currentTrack }: { currentTrack: Track }) {
   const { queue, history, playTrack } = useQueue();
   // history's last entry IS the current track (queue.store semantics) —
   // appending currentTrack again is what made the playing song show twice.
   const seen = new Set<string>();
   const all = [...history, currentTrack, ...queue].filter(t => {
      if (!t || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
   });

   if (all.length === 0) {
      return (
         <div className='flex flex-col items-center justify-center py-16 gap-3 text-center'>
            <Queue className='w-10 h-10 text-[var(--text-muted)]' />
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
                  <DownloadSimple className='w-2 h-2 text-white' />
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

// ── Main page ─────────────────────────────────────────────────

export default function NowPlaying() {
   const queryClient = useQueryClient();
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
   const playSource = usePlayerStore(s => s.playSource);
   // (Lyrics are preloaded by construction: the useLyrics query above runs
   // unconditionally on mount — the Lyrics tab reads the warmed cache.)

   // The PlayerBar lyrics button opens this view on the Lyrics tab
   useEffect(() => {
      const handler = (e: Event) => {
         if ((e as CustomEvent<string>).detail === "lyric") setTab("lyric");
      };
      window.addEventListener("rheoson:show-tab", handler);
      return () => window.removeEventListener("rheoson:show-tab", handler);
   }, []);

   const handleLike = async () => {
      if (!currentTrack) return;
      const next = !liked;
      setLiked(next);
      try {
         next
            ? await tracksApi.likeTrack(currentTrack.id)
            : await tracksApi.unlikeTrack(currentTrack.id);
         // Keep the count on every other page honest without a reload.
         invalidateLikeSurfaces(queryClient);
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
            openDownloadModal(currentTrack.id, currentTrack);
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
         className='fixed inset-0 z-50 flex flex-col bg-[rgb(var(--gray-950))] overflow-hidden'>
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

         {/* Scrollable main content — desktop centers the player column */}
         <div className='relative z-10 flex flex-col h-full overflow-y-auto no-scrollbar lg:max-w-2xl lg:mx-auto lg:w-full'>
            {/* Top bar */}
            <div className='flex items-center justify-between px-5 pt-10 pb-2 flex-shrink-0'>
               <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => navigate(-1)}
                  className='w-9 h-9 rounded-full bg-white/10 flex items-center justify-center'>
                  <CaretDown className='w-5 h-5 text-white' />
               </motion.button>

               <div className='flex items-center gap-2'>
                  {/* Offline badge — shown when track is downloaded */}
                  {currentTrack.isDownloaded && (
                     <div className='flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--accent-subtle)] border border-[var(--accent-border)]'>
                        <WifiSlash className='w-3 h-3 text-[var(--accent)]' />
                        <span className='text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider'>
                           Offline
                        </span>
                     </div>
                  )}
                  <p className='text-[10px] font-bold uppercase tracking-widest text-white/50 truncate max-w-[180px]'>
                     Playing from {playSource}
                  </p>
               </div>

               <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowMenu(true)}
                  className='w-9 h-9 rounded-full bg-white/10 flex items-center justify-center'>
                  <DotsThreeOutline className='w-5 h-5 text-white' />
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
                           {/* EQ-style loader — the app's playing motif, repurposed for buffering */}
                           <div className='flex items-end gap-1 h-6' role='status' aria-label='Loading'>
                              {[0, 1, 2].map(i => (
                                 <motion.span
                                    key={i}
                                    className='w-1 bg-white rounded-full h-full origin-bottom'
                                    animate={{ scaleY: [0.3, 1, 0.6] }}
                                    transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                                 />
                              ))}
                           </div>
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
                  onClick={() => openDownloadModal(currentTrack.id, currentTrack)}>
                  <DownloadSimple
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

            {/* Tabs — segmented pill control, active tab filled */}
            <div className='flex-shrink-0 px-6 mt-4 flex justify-center'>
               <div className='inline-flex gap-1 rounded-full bg-white/5 p-1'>
                  {(["queue", "lyric", "creator"] as Tab[]).map(t => (
                     <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                           "px-4 py-1.5 rounded-full text-xs font-bold transition-colors",
                           tab === t
                              ? "bg-white text-black"
                              : "text-white/50 hover:text-white/80"
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
