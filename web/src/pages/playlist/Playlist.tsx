import { useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Play, Shuffle, MoreHorizontal, Heart, Download, ListPlus, Pencil, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueue } from "@/hooks/queue.hook";
import { getPlaylist, playlistsApi } from "@/api/playlists.api";
import { tracksApi } from "@/api/tracks.api";
import { recommendationsApi } from "@/api/recommendations.api";
import TopBar from "@/components/layout/TopBar";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { TrackRowSkeleton } from "@/components/ui/Skeleton";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { useToast } from "@/components/ui/Toaster";
import { PlaylistCover, PlaylistCoverEditor } from "@/components/playlist/PlaylistCover";
import { usePlaylistMenuStore } from "@/store/playlistMenu.store";
import { useTrackContextMenu } from "@/hooks/useTrackContextMenu";
import { formatDuration, formatTotalDuration, truncate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Track } from "@/types/track.types";

export default function Playlist() {
   const { id } = useParams<{ id: string }>();
   const { playAll, playTrack, addToQueue } = useQueue();
   const { toast } = useToast();
   const queryClient = useQueryClient();
   const openPlaylistMenu = usePlaylistMenuStore((s) => s.openForTrack);

   const [showCoverEditor, setShowCoverEditor] = useState(false);

   const { data: playlist, isLoading } = useQuery({
      queryKey: ["playlist", id],
      queryFn: () => getPlaylist(id!),
      enabled: !!id,
   });

   const gradientIndex = parseInt(id ?? "0") % 8;

   const tracks = playlist?.tracks ?? [];

   // ── Suggested songs — seeded from the first playlist track ──
   const seedId = tracks[0]?.id;

   const { data: suggested, isLoading: loadingSuggested } = useQuery({
      queryKey: ["playlist-suggestions", id, seedId],
      queryFn: async (): Promise<Track[]> => {
         if (!seedId) return [];
         const res = await recommendationsApi.getAutoplay(seedId, 8);
         const existing = new Set(tracks.map((t) => t.id));
         const hydrated: Track[] = [];
         for (const cand of res.tracks) {
            if (existing.has(cand.track_id)) continue;
            try {
               const t = await tracksApi.getTrack(cand.track_id);
               if (t && !existing.has(t.id)) {
                  hydrated.push(t);
                  existing.add(t.id);
               }
            } catch {
               // skip unhydratable ids
            }
            if (hydrated.length >= 5) break;
         }
         return hydrated;
      },
      enabled: !!id && !!seedId && tracks.length > 0,
      staleTime: 5 * 60_000,
   });

   const handleAddSuggested = async (track: Track) => {
      if (!id) return;
      try {
         await playlistsApi.addTrack(id, track.id);
         toast(`Added "${truncate(track.title, 24)}"`, "success");
         queryClient.invalidateQueries({ queryKey: ["playlist", id] });
      } catch {
         toast("Could not add track", "error");
      }
   };

   const refreshCover = () => {
      queryClient.invalidateQueries({ queryKey: ["playlist", id] });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
   };

   return (
      <div className='flex flex-col h-full'>
         <TopBar transparent />

         <ScrollArea className='flex-1'>
            {/* ── Hero ──────────────────────────────────────────── */}
            <div className='relative'>
               <div
                  className={cn(
                     "absolute inset-0 bg-gradient-to-b opacity-40",
                     playlist?.artworkUrl && !playlist.artworkUrl.startsWith("gradient:")
                        ? "from-[var(--bg-elevated)] via-[var(--bg-surface)] to-[var(--bg-base)]"
                        : "from-transparent to-[var(--bg-base)]"
                  )}
               />
               <div
                  className={cn(
                     "absolute inset-0 bg-gradient-to-b",
                     playlist?.artworkUrl && !playlist.artworkUrl.startsWith("gradient:")
                        ? "from-transparent to-[var(--bg-base)]"
                        : "from-transparent via-transparent to-[var(--bg-base)]"
                  )}
               />

               <div className='relative px-4 lg:px-8 pt-4 pb-8'>
                  <motion.div
                     initial={{ opacity: 0, scale: 0.9 }}
                     animate={{ opacity: 1, scale: 1 }}
                     transition={{ type: "spring", damping: 22 }}
                     className='flex flex-col sm:flex-row items-start sm:items-end gap-6'>
                     {/* Cover — tappable to edit */}
                     <div className='relative group flex-shrink-0'>
                        <PlaylistCover
                           url={playlist?.artworkUrl}
                           alt={playlist?.title ?? ""}
                           fallbackIndex={gradientIndex}
                           className='w-44 h-44 rounded-3xl shadow-2xl border border-[var(--border)]'
                           iconClassName='w-12 h-12'
                        />
                        <button
                           onClick={() => setShowCoverEditor(true)}
                           className='absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/60 backdrop-blur border border-white/20
                              flex items-center justify-center text-white shadow-lg
                              opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity'
                           aria-label='Change cover'
                           title='Change cover'>
                           <Pencil className='w-4 h-4' />
                        </button>
                     </div>

                     <div>
                        <p className='text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1'>
                           Playlist
                        </p>
                        <h1 className='text-3xl font-bold text-[var(--text-primary)]'>
                           {playlist?.title ?? "—"}
                        </h1>
                        {playlist && (
                           <p className='text-sm text-[var(--text-secondary)] mt-1'>
                              {tracks.length} songs
                              {tracks.length > 0
                                 ? ` · ${formatTotalDuration(tracks.reduce((acc: number, t: Track) => acc + (t.duration || 0), 0))}`
                                 : ""}
                           </p>
                        )}
                     </div>
                  </motion.div>

                  <div className='flex items-center gap-3 mt-6'>
                     <Button
                        variant='primary'
                        size='md'
                        disabled={!tracks.length}
                        onClick={() => playlist && playAll(playlist.tracks)}>
                        <Play className='w-5 h-5 fill-current' />
                        Play
                     </Button>
                     <Button
                        variant='secondary'
                        size='md'
                        disabled={!tracks.length}
                        onClick={() => playlist && playAll(playlist.tracks, { shuffle: true })}>
                        <Shuffle className='w-4 h-4' />
                        Shuffle
                     </Button>
                     <IconButton size='md' variant='ghost'>
                        <Heart />
                     </IconButton>
                     <IconButton size='md' variant='ghost'>
                        <Download />
                     </IconButton>
                     <IconButton size='md' variant='ghost'>
                        <MoreHorizontal />
                     </IconButton>
                  </div>
               </div>
            </div>

            {/* ── Tracks ────────────────────────────────────────── */}
            <div className='px-4 lg:px-8 pb-8 space-y-1'>
               {isLoading &&
                  Array.from({ length: 8 }).map((_, i) => (
                     <TrackRowSkeleton key={i} />
                  ))}
               {tracks.map((track: Track, i: number) => (
                  <PlaylistTrackRow
                     key={track.id}
                     track={track}
                     index={i}
                     onClick={() => playlist && playTrack(track, playlist.tracks)}
                     onAddToPlaylist={(e) => {
                        e.stopPropagation();
                        openPlaylistMenu(track);
                     }}
                     onAddNext={(e) => {
                        e.stopPropagation();
                        const added = addToQueue(track);
                        toast(added ? `Queued "${truncate(track.title, 22)}"` : "Already in queue", added ? "success" : "info", 1800);
                     }}
                  />
               ))}

               {/* ── Suggested songs ─────────────────────────── */}
               {suggested && suggested.length > 0 && (
                  <div className='pt-8 pb-2'>
                     <div className='flex items-center gap-2 mb-1'>
                        <Plus className='w-4 h-4 text-[var(--accent)]' />
                        <p className='text-sm font-bold text-[var(--text-primary)]'>
                           Suggested for this playlist
                        </p>
                     </div>
                     <p className='text-xs text-[var(--text-muted)] mb-3'>
                        Based on {tracks[0]?.artist?.name ?? "your playlist"} — add what you like
                     </p>
                     <div className='space-y-1'>
                        {loadingSuggested &&
                           Array.from({ length: 3 }).map((_, idx) => (
                              <TrackRowSkeleton key={idx} />
                           ))}
                        {suggested.map((track) => (
                           <div
                              key={track.id}
                              className='flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-[var(--bg-elevated)] transition-colors group'>
                              <ArtworkImage
                                 src={track.artworkUrl}
                                 alt={track.title}
                                 size={40}
                                 radius='rounded-xl'
                              />
                              <div className='flex-1 min-w-0'>
                                 <p className='text-sm font-semibold text-[var(--text-primary)] truncate'>
                                    {track.title}
                                 </p>
                                 <p className='text-xs text-[var(--text-secondary)] truncate'>
                                    {track.artist?.name ?? "Unknown Artist"}
                                 </p>
                              </div>
                              <span className='text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0'>
                                 {formatDuration(track.duration)}
                              </span>
                              <button
                                 onClick={() => handleAddSuggested(track)}
                                 className='flex items-center gap-1.5 px-3 h-8 rounded-full bg-[var(--accent)] text-white text-xs font-bold
                                    opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0'
                                 title='Add to this playlist'>
                                 <Plus className='w-3.5 h-3.5' />
                                 Add
                              </button>
                           </div>
                        ))}
                     </div>
                  </div>
               )}
            </div>
         </ScrollArea>

         {/* Cover editor */}
         {playlist && (
            <PlaylistCoverEditor
               open={showCoverEditor}
               playlistId={playlist.id}
               currentUrl={playlist.artworkUrl}
               onClose={() => setShowCoverEditor(false)}
               onSaved={refreshCover}
            />
         )}
      </div>
   );
}

// ── PlaylistTrackRow ──────────────────────────────────────────

interface PlaylistTrackRowProps {
   track: Track;
   index: number;
   onClick: () => void;
   onAddToPlaylist: (e: React.MouseEvent) => void;
   onAddNext: (e: React.MouseEvent) => void;
}

function PlaylistTrackRow({ track, index, onClick, onAddToPlaylist, onAddNext }: PlaylistTrackRowProps) {
   const contextMenu = useTrackContextMenu(track);
   return (
      <motion.button
         initial={{ opacity: 0, y: 6 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ delay: index * 0.025 }}
         whileHover={{ backgroundColor: "var(--bg-elevated)" }}
         whileTap={{ scale: 0.98 }}
         onClick={onClick}
         {...contextMenu}
         className='w-full group flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left'>
         <span className='text-sm text-[var(--text-muted)] w-5 text-center tabular-nums group-hover:hidden'>
            {index + 1}
         </span>
         <Play className='w-4 h-4 text-[var(--text-primary)] fill-current hidden group-hover:block' />

         {track.artworkUrl ? (
            <img
               src={track.artworkUrl}
               alt={track.title}
               className='w-11 h-11 rounded-xl object-cover flex-shrink-0'
            />
         ) : (
            <div className='w-11 h-11 rounded-xl flex-shrink-0 bg-[var(--bg-elevated)]' />
         )}

         <div className='flex-1 min-w-0'>
            <p className='text-sm font-semibold text-[var(--text-primary)] truncate'>
               {track.title}
            </p>
            <p className='text-xs text-[var(--text-secondary)] truncate'>
               {track.artist?.name ?? "Unknown Artist"} · {track.album?.title ?? ""}
            </p>
         </div>
         <span className='text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0'>
            {formatDuration(track.duration)}
         </span>

         {/* Row actions — visible on hover / always on touch */}
         <div className='flex items-center gap-1 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity'>
            <button
               onClick={onAddNext}
               className='w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors'
               title='Add to queue'
               aria-label={`Queue ${track.title}`}>
               <ListPlus className='w-4 h-4 rotate-90' />
            </button>
            <button
               onClick={onAddToPlaylist}
               className='w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-elevated)] transition-colors'
               title='Add to playlist'
               aria-label={`Add ${track.title} to a playlist`}>
               <ListPlus className='w-4 h-4' />
            </button>
         </div>
      </motion.button>
   );
}