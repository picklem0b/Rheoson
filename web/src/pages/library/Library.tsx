import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
   Plus,
   Grid3X3,
   List,
   Music2,
   Disc3,
   User,
   Heart,
   ChevronRight,
   Play,
   Shuffle,
   X,
   Link as LinkIcon
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

type LibTab = "liked" | "playlists" | "albums" | "artists";

// ── Gradient pool — consistent colour per item ────────────────

const GRADIENTS = [
   "from-violet-800 to-purple-600",
   "from-rose-800 to-red-600",
   "from-cyan-800 to-blue-600",
   "from-amber-800 to-orange-600",
   "from-emerald-800 to-green-600",
   "from-pink-800 to-rose-600",
   "from-indigo-800 to-violet-600",
   "from-teal-800 to-cyan-600"
];

function gradient(i: number) {
   return GRADIENTS[i % GRADIENTS.length];
}

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
                     !item.artworkUrl && `bg-gradient-to-br ${gradient(i)}`
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
                           <Disc3 className='w-10 h-10 text-white/40' />
                        ) : (
                           <Music2 className='w-10 h-10 text-white/40' />
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
                     !item.artworkUrl && `bg-gradient-to-br ${gradient(i)}`,
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
                     <Disc3 className='w-6 h-6 text-white/50' />
                  ) : (
                     <Music2 className='w-6 h-6 text-white/50' />
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

               <ChevronRight
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
                     !artist.imageUrl && `bg-gradient-to-br ${gradient(i)}`,
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
      liked: {
         icon: <Heart className='w-8 h-8 text-[var(--text-muted)]' />,
         text: "No liked songs yet",
         sub: "Tap the heart icon on any song to save it here"
      },
      playlists: {
         icon: <Music2 className='w-8 h-8 text-[var(--text-muted)]' />,
         text: "No playlists yet",
         sub: "Create your first playlist"
      },
      albums: {
         icon: <Disc3 className='w-8 h-8 text-[var(--text-muted)]' />,
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

// ── Tab configuration ────────────────────────────────────────────

const TABS: { id: LibTab; label: string; icon: React.ReactNode }[] = [
   {
      id: "liked",
      label: "Liked Songs",
      icon: <Heart className='w-3.5 h-3.5 fill-current' />
   },
   {
      id: "playlists",
      label: "Playlists",
      icon: <Music2 className='w-3.5 h-3.5' />
   },
   { id: "albums", label: "Albums", icon: <Disc3 className='w-3.5 h-3.5' /> },
   { id: "artists", label: "Artists", icon: <User className='w-3.5 h-3.5' /> }
];

// ── CreatePlaylistModal (moved from Playlists page) ─────────────

function CreatePlaylistModal({ onClose }: { onClose: () => void }) {
   const queryClient = useQueryClient();
   const { toast } = useToast();
   const [title, setTitle] = useState("");
   const [description, setDescription] = useState("");
   const [importUrl, setImportUrl] = useState("");
   const [mode, setMode] = useState<"create" | "import">("create");

   const createMutation = useMutation({
      mutationFn: () =>
         playlistsApi.createPlaylist({
            title: title.trim(),
            description: description.trim() || undefined
         }),
      onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ["playlists"] });
         toast("Playlist created!", "success");
         onClose();
      },
      onError: () => toast("Failed to create playlist", "error")
   });

   const importMutation = useMutation({
      mutationFn: () => playlistsApi.importSpotify(importUrl.trim()),
      onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ["playlists"] });
         toast("Playlist imported!", "success");
         onClose();
      },
      onError: () => toast("Failed to import playlist", "error")
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
                  <>
                     <div>
                        <label className='text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider'>
                           Title
                        </label>
                        <input
                           autoFocus
                           value={title}
                           onChange={e => setTitle(e.target.value)}
                           onKeyDown={e => e.key === "Enter" && handleSubmit()}
                           placeholder='My awesome playlist'
                           className='w-full mt-1.5 px-4 py-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]'
                        />
                     </div>
                     <div>
                        <label className='text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider'>
                           Description (optional)
                        </label>
                        <input
                           value={description}
                           onChange={e => setDescription(e.target.value)}
                           placeholder='A short description...'
                           className='w-full mt-1.5 px-4 py-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]'
                        />
                     </div>
                  </>
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
               <Music2 className='w-4 h-4 text-[var(--text-muted)]' />
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
               className='p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10'
               aria-label='Unlike'>
               <Heart className='w-4 h-4 text-red-400 fill-current' />
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

   const [tab, setTab] = useState<LibTab>("liked");
   const [grid, setGrid] = useState(true);
   const [showCreate, setShowCreate] = useState(false);

   const { data: playlists, isLoading: loadingPlaylists } = useQuery({
      queryKey: ["playlists"],
      queryFn: getPlaylists
   });

   const { data: albums, isLoading: loadingAlbums } = useQuery({
      queryKey: ["library-albums"],
      queryFn: getAlbums,
      enabled: tab === "albums"
   });

   const { data: artists, isLoading: loadingArtists } = useQuery({
      queryKey: ["library-artists"],
      queryFn: getArtists,
      enabled: tab === "artists"
   });

   const { data: likedTracks, isLoading: loadingLiked } = useQuery<Track[]>({
      queryKey: ["liked-tracks"],
      queryFn: () => tracksApi.getLiked(),
      enabled: tab === "liked"
   });

   const { playAll, playTrack } = useQueue();

   const isLoading =
      (tab === "playlists" && loadingPlaylists) ||
      (tab === "albums" && loadingAlbums) ||
      (tab === "artists" && loadingArtists) ||
      (tab === "liked" && loadingLiked);

   const currentItems =
      tab === "playlists"
         ? (playlists ?? [])
         : tab === "albums"
           ? (albums ?? [])
           : [];

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

   const handleUnlike = async (e: React.MouseEvent, trackId: string) => {
      e.stopPropagation();
      try {
         await tracksApi.unlikeTrack(trackId);
         queryClient.invalidateQueries({ queryKey: ["liked-tracks"] });
         queryClient.invalidateQueries({ queryKey: ["liked-count"] });
      } catch {
         // revert silently
      }
   };

   const queryClient = useQueryClient();

   return (
      <div className='flex flex-col h-full'>
         {/* ── Header ──────────────────────────────────────────── */}
         <div className='px-4 pt-6 pb-3 flex-shrink-0 space-y-4'>
            <div className='flex items-center justify-between'>
               <h1 className='text-2xl font-bold text-[var(--text-primary)]'>
                  Library
               </h1>
               <div className='flex items-center gap-1'>
                  {/* Grid/List toggle — only for playlists + albums */}
                  {(tab === "playlists" || tab === "albums") && (
                     <IconButton
                        size='sm'
                        variant='ghost'
                        onClick={() => setGrid(!grid)}
                        title={grid ? "List view" : "Grid view"}>
                        {grid ? <List /> : <Grid3X3 />}
                     </IconButton>
                  )}
                  {tab === "playlists" && (
                     <IconButton
                        size='sm'
                        variant='accent'
                        onClick={handleCreate}
                        title='New playlist'>
                        <Plus />
                     </IconButton>
                  )}
               </div>
            </div>

            {/* Tab pills */}
            <div className='flex gap-2 overflow-x-auto no-scrollbar pb-1'>
               {TABS.map(t => (
                  <motion.button
                     key={t.id}
                     whileTap={{ scale: 0.93 }}
                     onClick={() => setTab(t.id)}
                     className={cn(
                        "flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold",
                        "transition-all duration-200",
                        t.id === tab
                           ? "bg-[var(--text-primary)] text-[var(--bg-base)] shadow-md"
                           : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]"
                     )}>
                     {t.icon}
                     {t.label}
                  </motion.button>
               ))}
            </div>
         </div>

         <ScrollArea className='flex-1 px-4 pb-6'>
            {/* ── Tab content ──────────────────────────────────── */}
            <AnimatePresence mode='wait'>
               <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}>
                  {/* ── Liked Songs tab ───────────────────────── */}
                  {tab === "liked" && (
                     <div className='space-y-6'>
                        {/* Hero header */}
                        <motion.div
                           initial={{ opacity: 0, y: -10 }}
                           animate={{ opacity: 1, y: 0 }}
                           className='flex-shrink-0'>
                           <div className='flex items-end gap-6'>
                              <div className='w-28 h-28 lg:w-36 lg:h-36 rounded-3xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shadow-2xl flex-shrink-0'>
                                 <Heart className='w-12 h-12 lg:w-14 lg:h-14 text-white fill-current' />
                              </div>
                              <div className='min-w-0'>
                                 <p className='text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1'>
                                    Playlist
                                 </p>
                                 <h2 className='text-3xl lg:text-4xl font-bold text-[var(--text-primary)]'>
                                    Liked Songs
                                 </h2>
                                 {likedTracks && (
                                    <p className='text-sm text-[var(--text-secondary)] mt-2'>
                                       {likedTracks.length}{" "}
                                       {likedTracks.length === 1
                                          ? "song"
                                          : "songs"}
                                    </p>
                                 )}
                              </div>
                           </div>

                           <div className='flex items-center gap-3 mt-6'>
                              <Button
                                 variant='primary'
                                 size='md'
                                 disabled={!likedTracks?.length}
                                 onClick={() =>
                                    likedTracks && handlePlayAll(likedTracks)
                                 }>
                                 <Play className='w-5 h-5 fill-current' />
                                 Play all
                              </Button>
                              <Button
                                 variant='secondary'
                                 size='md'
                                 disabled={!likedTracks?.length}
                                 onClick={() =>
                                    likedTracks &&
                                    handlePlayAll(likedTracks, true)
                                 }>
                                 <Shuffle className='w-4 h-4' />
                                 Shuffle
                              </Button>
                           </div>
                        </motion.div>

                        {/* Track list */}
                        <div className='space-y-1'>
                           {loadingLiked &&
                              Array.from({ length: 10 }).map((_, i) => (
                                 <Skeleton
                                    key={i}
                                    className='h-14 rounded-2xl'
                                 />
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
                                 <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className='flex flex-col items-center justify-center py-24 gap-4'>
                                    <div className='w-20 h-20 rounded-[2rem] bg-[var(--bg-elevated)] flex items-center justify-center border border-[var(--border)]'>
                                       <Heart className='w-9 h-9 text-[var(--text-muted)]' />
                                    </div>
                                    <div className='text-center'>
                                       <p className='font-bold text-[var(--text-primary)] text-lg'>
                                          No liked songs yet
                                       </p>
                                       <p className='text-[var(--text-muted)] text-sm mt-1'>
                                          Tap the heart icon on any song to save
                                          it here
                                       </p>
                                    </div>
                                 </motion.div>
                              )}
                        </div>
                     </div>
                  )}

                  {/* ── Playlists / Albums tabs ──────────────── */}
                  {!isLoading &&
                     tab !== "artists" &&
                     tab !== "liked" &&
                     (currentItems.length === 0 ? (
                        <EmptyState tab={tab} onCreate={handleCreate} />
                     ) : grid ? (
                        <GridView
                           items={currentItems}
                           onSelect={id =>
                              navigate(`/${tab.slice(0, -1)}/${id}`)
                           }
                        />
                     ) : (
                        <ListView
                           items={currentItems}
                           onSelect={id =>
                              navigate(`/${tab.slice(0, -1)}/${id}`)
                           }
                        />
                     ))}

                  {/* ── Artists tab ───────────────────────────── */}
                  {!isLoading &&
                     tab === "artists" &&
                     (!artists || artists.length === 0 ? (
                        <EmptyState tab='artists' onCreate={handleCreate} />
                     ) : (
                        <ArtistGrid
                           artists={artists}
                           onSelect={id => navigate(`/artist/${id}`)}
                        />
                     ))}
               </motion.div>
            </AnimatePresence>
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
