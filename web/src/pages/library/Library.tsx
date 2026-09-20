import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
   Plus,
   SquaresFour,
   List,
   MusicNotes,
   VinylRecord,
   User,
   Heart,
   CaretRight,
   Play,
   Shuffle,
   X,
   Link as LinkIcon
} from '@phosphor-icons/react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
   invalidateLikeSurfaces,
   invalidatePlaylistSurfaces
} from "@/lib/queryInvalidation";
import { qk } from "@/lib/queryKeys";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toaster";
import { getPlaylists } from "@/api/playlists.api";
import { getAlbums, getArtists } from "@/api/library.api";
import { tracksApi } from "@/api/tracks.api";
import { playlistsApi } from "@/api/playlists.api";
import { useQueue } from "@/hooks/queue.hook";
import { useTrackContextMenu } from "@/hooks/useTrackContextMenu";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/formatters";
import type { Artist, Track } from "@/types/track.types";

type LibTab = "playlists" | "albums" | "artists";

// ── Skeleton loaders ──────────────────────────────────────────

// ── Grid view ─────────────────────────────────────────────────

function GridView({
   items,
   onSelect
}: {
   items: { id: string; artworkUrl?: string; title?: string; trackCount?: number; artist?: { name?: string } }[];
   onSelect: (id: string) => void;
}) {
   return (
      <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-4'>
         {items.map((item, i) => (
            <motion.button
               key={item.id}
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{
                  delay: i * 0.03,
                  type: "spring",
                  damping: 22,
                  stiffness: 260
               }}
               whileTap={{ scale: 0.96 }}
               onClick={() => onSelect(item.id)}
               className='text-left group'>
               {/* Artwork */}
               <div
                  className={cn(
                     "w-full aspect-square rounded-3xl mb-2.5 relative overflow-hidden",
                     "border border-[var(--border)] shadow-md",
                     !item.artworkUrl && "bg-[var(--bg-overlay)]"
                  )}>
                  {item.artworkUrl ? (
                     <img
                        src={item.artworkUrl}
                        alt={item.title}
                        className='w-full h-full object-cover'
                        onError={e => {
                           (e.target as HTMLImageElement).src =
                              "/assets/logo.png";
                        }}
                     />
                  ) : (
                     <div className='w-full h-full flex items-center justify-center'>
                        {"artist" in item ? (
                           <VinylRecord className='w-10 h-10 text-[var(--text-muted)]' />
                        ) : (
                           <MusicNotes className='w-10 h-10 text-white/40' />
                        )}
                     </div>
                  )}

                  {/* Play button on tap */}
                  <div
                     className='absolute inset-0 bg-black/30 opacity-0 group-active:opacity-100
                            transition-opacity flex items-center justify-center'>
                     <div className='w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-xl'>
                        <Play className='w-5 h-5 text-black fill-current translate-x-0.5' />
                     </div>
                  </div>
               </div>

               <p className='text-sm font-bold text-[var(--text-primary)] truncate leading-tight'>
                  {item.title}
               </p>
               <p className='text-xs text-[var(--text-muted)] truncate mt-0.5 leading-tight'>
                  {"artist" in item
                     ? (item.artist?.name ?? "")
                     : item.trackCount != null
                       ? `${item.trackCount} songs`
                       : ""}
               </p>
            </motion.button>
         ))}
      </div>
   );
}

// ── List view ─────────────────────────────────────────────────

function ListView({
   items,
   onSelect
}: {
   items: { id: string; artworkUrl?: string; title?: string; trackCount?: number; artist?: { name?: string } }[];
   onSelect: (id: string) => void;
}) {
   return (
      <div className='space-y-1 pb-4'>
         {items.map((item, i) => (
            <motion.button
               key={item.id}
               initial={{ opacity: 0, x: -8 }}
               animate={{ opacity: 1, x: 0 }}
               transition={{ delay: i * 0.025 }}
               whileTap={{ scale: 0.98 }}
               onClick={() => onSelect(item.id)}
               className='w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl
                     hover:bg-[var(--bg-elevated)] active:bg-[var(--bg-elevated)]
                     transition-colors text-left group'>
               {/* Artwork */}
               <div
                  className={cn(
                     "w-14 h-14 rounded-2xl flex-shrink-0 overflow-hidden border border-[var(--border)]",
                     !item.artworkUrl && "bg-[var(--bg-overlay)]",
                     "flex items-center justify-center"
                  )}>
                  {item.artworkUrl ? (
                     <img
                        src={item.artworkUrl}
                        alt={item.title}
                        className='w-full h-full object-cover'
                        onError={e => {
                           (e.target as HTMLImageElement).src =
                              "/assets/logo.png";
                        }}
                     />
                  ) : "artist" in item ? (
                     <VinylRecord className='w-6 h-6 text-[var(--text-muted)]' />
                  ) : (
                     <MusicNotes className='w-6 h-6 text-white/50' />
                  )}
               </div>

               {/* Info */}
               <div className='flex-1 min-w-0'>
                  <p className='text-sm font-semibold text-[var(--text-primary)] truncate leading-tight'>
                     {item.title}
                  </p>
                  <p className='text-xs text-[var(--text-muted)] truncate mt-0.5 leading-tight'>
                     {"artist" in item
                        ? (item.artist?.name ?? "")
                        : item.trackCount != null
                          ? `${item.trackCount} songs`
                          : ""}
                  </p>
               </div>

               <CaretRight
                  className='w-4 h-4 text-[var(--text-muted)] flex-shrink-0
                                   opacity-0 group-hover:opacity-100 group-active:opacity-100
                                   transition-opacity'
               />
            </motion.button>
         ))}
      </div>
   );
}

// ── Artist grid ───────────────────────────────────────────────

function ArtistGrid({
   artists,
   onSelect
}: {
   artists: Artist[];
   onSelect: (id: string) => void;
}) {
   return (
      <div className='grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4 pb-4'>
         {artists.map((artist, i) => (
            <motion.button
               key={artist.id}
               initial={{ opacity: 0, scale: 0.88 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{
                  delay: i * 0.03,
                  type: "spring",
                  damping: 22,
                  stiffness: 260
               }}
               whileTap={{ scale: 0.94 }}
               onClick={() => onSelect(artist.id)}
               className='flex flex-col items-center gap-2 group'>
               <div
                  className={cn(
                     "w-full aspect-square rounded-full overflow-hidden",
                     "border-2 border-[var(--border)] group-active:border-[var(--accent)]",
                     "transition-colors shadow-md",
                     !artist.imageUrl && "bg-[var(--bg-overlay)]",
                     "flex items-center justify-center"
                  )}>
                  {artist.imageUrl ? (
                     <img
                        src={artist.imageUrl}
                        alt={artist.name}
                        className='w-full h-full object-cover'
                        onError={e => {
                           (e.target as HTMLImageElement).src =
                              "/assets/logo.png";
                        }}
                     />
                  ) : (
                     <User className='w-6 h-6 text-white/50' />
                  )}
               </div>
               <p
                  className='text-xs font-semibold text-[var(--text-primary)] text-center
                        truncate w-full leading-tight'>
                  {artist.name}
               </p>
            </motion.button>
         ))}
      </div>
   );
}

// ── Empty state ───────────────────────────────────────────────

function EmptyState({ tab, onCreate }: { tab: LibTab; onCreate: () => void }) {
   const messages = {
      playlists: {
         icon: <MusicNotes className='w-8 h-8 text-[var(--text-muted)]' />,
         text: "No playlists yet",
         sub: "Create your first playlist"
      },
      albums: {
         icon: <VinylRecord className='w-8 h-8 text-[var(--text-muted)]' />,
         text: "No albums saved",
         sub: "Albums from your downloads appear here"
      },
      artists: {
         icon: <User className='w-8 h-8 text-[var(--text-muted)]' />,
         text: "No artists saved",
         sub: "Artists from your downloads appear here"
      }
   };
   const m = messages[tab];

   return (
      <motion.div
         initial={{ opacity: 0, y: 10 }}
         animate={{ opacity: 1, y: 0 }}
         className='flex flex-col items-center justify-center py-20 gap-4 text-center'>
         <div className='w-16 h-16 rounded-3xl bg-[var(--bg-elevated)] flex items-center justify-center'>
            {m.icon}
         </div>
         <div>
            <p className='font-semibold text-[var(--text-primary)]'>{m.text}</p>
            <p className='text-sm text-[var(--text-muted)] mt-1'>{m.sub}</p>
         </div>
         {tab === "playlists" && (
            <motion.button
               whileTap={{ scale: 0.95 }}
               onClick={onCreate}
               className='flex items-center gap-2 px-5 py-2.5 rounded-full
                     bg-[var(--accent)] text-white text-sm font-bold shadow-lg'>
               <Plus className='w-4 h-4' />
               New Playlist
            </motion.button>
         )}
      </motion.div>
   );
}

// ── Sections ─────────────────────────────────────────────────────
//
// The library used to be a set of tabs, so only one section was ever visible
// and its heading carried no weight. Stacking them means each needs a real
// heading and a divider that reads as structure rather than a stray line.

function SectionHeading({
   icon,
   title,
   count,
   actions
}: {
   icon: React.ReactNode;
   title: string;
   count?: number;
   actions?: React.ReactNode;
}) {
   return (
      <div className='mb-4'>
         <div className='flex items-center gap-3'>
            <span className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--bg-elevated)] text-[var(--accent)]'>
               {icon}
            </span>
            <h2 className='text-xl font-bold text-[var(--text-primary)]'>
               {title}
            </h2>
            {count !== undefined && count > 0 && (
               <span className='text-[13px] font-semibold tabular-nums text-[var(--text-muted)]'>
                  {count}
               </span>
            )}
            <span className='min-w-2 flex-1' />
            {actions}
         </div>
         {/* A rule that fades out rather than a hard line: it separates the
             sections without drawing a box around each one. */}
         <div
            aria-hidden
            className='mt-3 h-px w-full bg-gradient-to-r from-[var(--border-strong)] via-[var(--border)] to-transparent'
         />
      </div>
   );
}

function EmptySection({
   icon,
   title,
   note
}: {
   icon: React.ReactNode;
   title: string;
   note: string;
}) {
   return (
      <div className='flex flex-col items-center justify-center gap-3 py-14'>
         <div className='flex h-16 w-16 items-center justify-center rounded-[1.75rem] border border-[var(--border)] bg-[var(--bg-elevated)]'>
            {icon}
         </div>
         <div className='text-center'>
            <p className='text-base font-bold text-[var(--text-primary)]'>{title}</p>
            <p className='mt-1 text-sm text-[var(--text-muted)]'>{note}</p>
         </div>
      </div>
   );
}

/** Grid or list, with the loading and empty states the section needs. */
function LibraryItems({
   loading,
   items,
   empty,
   grid,
   onSelect
}: {
   loading: boolean;
   items: Parameters<typeof GridView>[0]["items"];
   empty: React.ReactNode;
   grid: boolean;
   onSelect: (id: string) => void;
}) {
   if (loading) {
      return (
         <div className='grid grid-cols-2 gap-4 pb-2 sm:grid-cols-3 lg:grid-cols-4'>
            {Array.from({ length: 4 }).map((_, i) => (
               <Skeleton key={i} className='h-40 rounded-2xl' />
            ))}
         </div>
      );
   }
   if (items.length === 0) return <>{empty}</>;
   return grid ? (
      <GridView items={items} onSelect={onSelect} />
   ) : (
      <ListView items={items} onSelect={onSelect} />
   );
}

// ── CreatePlaylistModal (moved from Playlists page) ─────────────

function CreatePlaylistModal({ onClose }: { onClose: () => void }) {
   const queryClient = useQueryClient();
   const { toast } = useToast();
   const [title, setTitle] = useState("");
   const [importUrl, setImportUrl] = useState("");
   const [mode, setMode] = useState<"create" | "import">("create");

   const createMutation = useMutation({
      mutationFn: () => playlistsApi.createPlaylist({ title: title.trim() }),
      onSuccess: () => {
         invalidatePlaylistSurfaces(queryClient);
         toast("Playlist created", "success");
         onClose();
      },
      onError: () => toast("Could not create playlist", "error")
   });

   const importMutation = useMutation({
      mutationFn: () => playlistsApi.importSpotify(importUrl.trim()),
      onSuccess: () => {
         invalidatePlaylistSurfaces(queryClient);
         toast("Playlist imported!", "success");
         onClose();
      },
      onError: () => toast("Could not import playlist", "error")
   });

   const handleSubmit = () => {
      if (mode === "create") {
         if (!title.trim()) return;
         createMutation.mutate();
      } else {
         if (!importUrl.trim()) return;
         importMutation.mutate();
      }
   };

   return (
      <motion.div
         className='absolute inset-0 z-40 flex items-center justify-center'
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         exit={{ opacity: 0 }}>
         <div
            className='absolute inset-0 bg-black/60 backdrop-blur-sm'
            onClick={onClose}
         />
         <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className='relative z-10 w-[90vw] max-w-md bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] shadow-2xl overflow-hidden'>
            {/* Header */}
            <div className='flex items-center justify-between px-6 py-4 border-b border-[var(--border)]'>
               <h2 className='text-lg font-bold text-[var(--text-primary)]'>
                  {mode === "create" ? "New Playlist" : "Import Playlist"}
               </h2>
               <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className='w-8 h-8 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center'>
                  <X className='w-4 h-4 text-[var(--text-muted)]' />
               </motion.button>
            </div>

            {/* Mode switcher */}
            <div className='flex gap-2 px-6 pt-4'>
               {(["create", "import"] as const).map(m => (
                  <button
                     key={m}
                     onClick={() => setMode(m)}
                     className={cn(
                        "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all",
                        mode === m
                           ? "bg-[var(--text-primary)] text-[var(--bg-base)]"
                           : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]"
                     )}>
                     {m === "create" ? (
                        <Plus className='w-3.5 h-3.5' />
                     ) : (
                        <LinkIcon className='w-3.5 h-3.5' />
                     )}
                     {m === "create" ? "Create" : "Import"}
                  </button>
               ))}
            </div>

            {/* Form */}
            <div className='px-6 py-4 space-y-3'>
               {mode === "create" ? (
                  <div>
                     <input
                        autoFocus
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSubmit()}
                        placeholder='Playlist name'
                        maxLength={80}
                        className='w-full px-4 py-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:font-normal outline-none focus:border-[var(--accent)] transition-colors'
                     />
                  </div>
               ) : (
                  <div>
                     <label className='text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider'>
                        Spotify / YouTube URL
                     </label>
                     <input
                        autoFocus
                        value={importUrl}
                        onChange={e => setImportUrl(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSubmit()}
                        placeholder='https://open.spotify.com/playlist/...'
                        className='w-full mt-1.5 px-4 py-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]'
                     />
                  </div>
               )}
            </div>

            {/* Actions */}
            <div className='flex items-center gap-2 px-6 pb-5'>
               <Button variant='ghost' onClick={onClose} className='flex-1'>
                  Cancel
               </Button>
               <Button
                  variant='primary'
                  onClick={handleSubmit}
                  loading={createMutation.isPending || importMutation.isPending}
                  disabled={
                     mode === "create" ? !title.trim() : !importUrl.trim()
                  }
                  className='flex-1'>
                  {mode === "create" ? "Create" : "Import"}
               </Button>
            </div>
         </motion.div>
      </motion.div>
   );
}

// ── Track row for liked songs ─────────────────────────────────

function LikedTrackRow({
   track,
   index,
   onPlay,
   onUnlike
}: {
   track: Track;
   index: number;
   onPlay: () => void;
   onUnlike: (e: React.MouseEvent) => void;
}) {
   const contextMenu = useTrackContextMenu(track);
   return (
      <motion.button
         initial={{ opacity: 0, y: 8 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ delay: index * 0.03 }}
         whileHover={{ backgroundColor: "var(--bg-elevated)" }}
         whileTap={{ scale: 0.98 }}
         onClick={onPlay}
         {...contextMenu}
         className='w-full group flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left'>
         <span className='text-sm text-[var(--text-muted)] w-5 text-center tabular-nums group-hover:hidden'>
            {index + 1}
         </span>
         <Play className='w-4 h-4 text-[var(--text-primary)] fill-current hidden group-hover:block w-5 text-center' />

         {track.artworkUrl ? (
            <img
               src={track.artworkUrl}
               alt={track.title}
               className='w-11 h-11 rounded-xl object-cover flex-shrink-0'
            />
         ) : (
            <div className='w-11 h-11 rounded-xl flex-shrink-0 bg-[var(--bg-elevated)] flex items-center justify-center'>
               <MusicNotes className='w-4 h-4 text-[var(--text-muted)]' />
            </div>
         )}

         <div className='flex-1 min-w-0'>
            <p className='text-sm font-semibold text-[var(--text-primary)] truncate'>
               {track.title}
            </p>
            <p className='text-xs text-[var(--text-secondary)] truncate'>
               {track.artist?.name ?? 'Unknown Artist'}
               {track.album?.title ? ` · ${track.album.title}` : ""}
            </p>
         </div>

         <div className='flex items-center gap-2 flex-shrink-0'>
            {/* Unlike button — visible on hover */}
            <motion.button
               whileTap={{ scale: 0.8 }}
               onClick={onUnlike}
               className='p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--danger-bg)]'
               aria-label='Unlike'>
               <Heart className='w-4 h-4 text-[var(--danger-text)] fill-current' />
            </motion.button>
            <span className='text-xs text-[var(--text-muted)] tabular-nums'>
               {formatDuration(track.duration)}
            </span>
         </div>
      </motion.button>
   );
}

export default function Library() {
   const navigate = useNavigate();
   const { toast } = useToast();

   const [grid, setGrid] = useState(true);
   const [showCreate, setShowCreate] = useState(false);

   // Every section is on screen at once, so every query is live — nothing here
   // waits on a tab the user may never open.
   const { data: playlists, isLoading: loadingPlaylists } = useQuery({
      queryKey: qk.playlists(),
      queryFn: getPlaylists
   });

   const { data: albums, isLoading: loadingAlbums } = useQuery({
      queryKey: qk.libraryAlbums(),
      queryFn: getAlbums
   });

   const { data: artists, isLoading: loadingArtists } = useQuery({
      queryKey: qk.libraryArtists(),
      queryFn: getArtists
   });

   const { data: likedTracks, isLoading: loadingLiked } = useQuery<Track[]>({
      queryKey: qk.likedTracks(),
      queryFn: () => tracksApi.getLiked()
   });

   const { playAll, playTrack } = useQueue();

   const handleCreate = () => {
      setShowCreate(true);
   };

   const handlePlayAll = (tracks: Track[], shuffled = false) => {
      if (tracks.length > 0) {
         playAll(tracks, { shuffle: shuffled });
         toast(
            `Playing ${tracks.length} songs${shuffled ? " (shuffled)" : ""}`,
            "success",
            2000
         );
      }
   };

   const queryClient = useQueryClient();

   const handleUnlike = async (e: React.MouseEvent, trackId: string) => {
      e.stopPropagation();
      try {
         await tracksApi.unlikeTrack(trackId);
         invalidateLikeSurfaces(queryClient);
      } catch {
         // revert silently
      }
   };

   return (
      <div className='flex flex-col h-full'>
         {/* ── Header ──────────────────────────────────────────── */}
         <div className='flex flex-shrink-0 items-center justify-between px-4 pt-6 pb-4 lg:px-8'>
            <h1 className='text-2xl font-bold text-[var(--text-primary)]'>
               Library
            </h1>
            <div className='flex items-center gap-1'>
               <IconButton
                  size='sm'
                  variant='ghost'
                  onClick={() => setGrid(!grid)}
                  title={grid ? "List view" : "Grid view"}>
                  {grid ? <List /> : <SquaresFour />}
               </IconButton>
               <IconButton
                  size='sm'
                  variant='accent'
                  onClick={handleCreate}
                  title='New playlist'>
                  <Plus />
               </IconButton>
            </div>
         </div>

         <ScrollArea className='flex-1 px-4 lg:px-8 pb-10'>
            <div className='space-y-10 lg:mx-auto lg:max-w-6xl'>
               {/* ── Liked Songs ─────────────────────────────── */}
               <section>
                  <SectionHeading
                     icon={<Heart className='h-4 w-4 fill-current' />}
                     title='Liked Songs'
                     count={likedTracks?.length}
                     actions={
                        <div className='flex items-center gap-2'>
                           <Button
                              variant='primary'
                              size='sm'
                              disabled={!likedTracks?.length}
                              onClick={() =>
                                 likedTracks && handlePlayAll(likedTracks)
                              }>
                              <Play className='h-4 w-4 fill-current' />
                              Play
                           </Button>
                           <Button
                              variant='secondary'
                              size='sm'
                              disabled={!likedTracks?.length}
                              onClick={() =>
                                 likedTracks && handlePlayAll(likedTracks, true)
                              }
                              title='Shuffle liked songs'>
                              <Shuffle className='h-4 w-4' />
                           </Button>
                        </div>
                     }
                  />
                  <div className='space-y-1'>
                     {loadingLiked &&
                        Array.from({ length: 8 }).map((_, i) => (
                           <Skeleton key={i} className='h-14 rounded-2xl' />
                        ))}
                     {likedTracks?.map((track, i) => (
                        <LikedTrackRow
                           key={track.id}
                           track={track}
                           index={i}
                           onPlay={() => playTrack(track, likedTracks)}
                           onUnlike={e => handleUnlike(e, track.id)}
                        />
                     ))}
                     {!loadingLiked &&
                        likedTracks &&
                        likedTracks.length === 0 && (
                           <EmptySection
                              icon={
                                 <Heart className='h-6 w-6 text-[var(--text-muted)]' />
                              }
                              title='No liked songs yet'
                              note='Tap the heart on any song to save it here'
                           />
                        )}
                  </div>
               </section>

               {/* ── Playlists ───────────────────────────────── */}
               <section>
                  <SectionHeading
                     icon={<MusicNotes className='h-4 w-4' />}
                     title='Playlists'
                     count={playlists?.length}
                  />
                  <LibraryItems
                     loading={loadingPlaylists}
                     items={playlists ?? []}
                     empty={<EmptyState tab='playlists' onCreate={handleCreate} />}
                     grid={grid}
                     onSelect={id => navigate(`/playlist/${id}`)}
                  />
               </section>

               {/* ── Albums ──────────────────────────────────── */}
               <section>
                  <SectionHeading
                     icon={<VinylRecord className='h-4 w-4' />}
                     title='Albums'
                     count={albums?.length}
                  />
                  <LibraryItems
                     loading={loadingAlbums}
                     items={albums ?? []}
                     empty={<EmptyState tab='albums' onCreate={handleCreate} />}
                     grid={grid}
                     onSelect={id => navigate(`/album/${id}`)}
                  />
               </section>

               {/* ── Artists ─────────────────────────────────── */}
               <section>
                  <SectionHeading
                     icon={<User className='h-4 w-4' />}
                     title='Artists'
                     count={artists?.length}
                  />
                  {loadingArtists ? (
                     <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'>
                        {Array.from({ length: 4 }).map((_, i) => (
                           <Skeleton key={i} className='h-32 rounded-2xl' />
                        ))}
                     </div>
                  ) : !artists || artists.length === 0 ? (
                     <EmptyState tab='artists' onCreate={handleCreate} />
                  ) : (
                     <ArtistGrid
                        artists={artists}
                        onSelect={id => navigate(`/artist/${id}`)}
                     />
                  )}
               </section>
            </div>
         </ScrollArea>

         {/* Create / Import modal */}
         <AnimatePresence>
            {showCreate && (
               <CreatePlaylistModal onClose={() => setShowCreate(false)} />
            )}
         </AnimatePresence>
      </div>
   );
}
