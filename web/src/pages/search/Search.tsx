import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
   Search as SearchIcon,
   X,
   User,
   Download,
   Music2,
   Disc3,
   ListMusic,
   Link2,
   TrendingUp
} from "lucide-react";
import { useSearch } from "@/hooks/search.hook";
import { useQueue } from "@/hooks/queue.hook";
import { useUIStore } from "@/store/ui.store";
import { useToast } from "@/components/ui/Toaster";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { SearchBar } from "./components/SearchBar";
import { CategoryGrid, ResultSection } from "./components/CategoryGrid";
import { formatDuration, truncate } from "@/lib/formatters";
import { detectInputType, cn } from "@/lib/utils";
import type { SearchFilter } from "@/types/search.types";
import type { Track, Album, Artist, Playlist } from "@/types";

const FILTERS: { id: SearchFilter; label: string }[] = [
   { id: "all", label: "All" },
   { id: "tracks", label: "Tracks" },
   { id: "albums", label: "Albums" },
   { id: "artists", label: "Artists" },
   { id: "playlists", label: "Playlists" }
];

// ── Track row ─────────────────────────────────────────────────

function TrackRow({
   track,
   index,
   onPlay,
   onDownload
}: {
   track: Track;
   index: number;
   onPlay: () => void;
   onDownload: (e: React.MouseEvent) => void;
}) {
   return (
      <motion.div
         initial={{ opacity: 0, y: 6 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ delay: index * 0.025, duration: 0.2 }}
         className='flex items-center gap-3 px-3 py-2.5 rounded-2xl
                 active:bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)]
                 transition-colors cursor-pointer group'
         onClick={onPlay}>
         {/* Artwork */}
         <div className='relative flex-shrink-0'>
            {track.artworkUrl ? (
               <img
                  src={track.artworkUrl}
                  alt={track.title}
                  className='w-12 h-12 rounded-xl object-cover'
                  onError={e => {
                     (e.target as HTMLImageElement).src = "/assets/logo.png";
                  }}
               />
            ) : (
               <div className='w-12 h-12 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center'>
                  <Music2 className='w-5 h-5 text-[var(--text-muted)]' />
               </div>
            )}
            {/* Downloaded badge */}
            {track.isDownloaded && (
               <div
                  className='absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full
                          bg-[var(--accent)] flex items-center justify-center'>
                  <Download className='w-2 h-2 text-white' />
               </div>
            )}
         </div>

         {/* Info */}
         <div className='flex-1 min-w-0'>
            <p className='text-sm font-semibold text-[var(--text-primary)] truncate leading-tight'>
               {track.title}
            </p>
            <p className='text-xs text-[var(--text-secondary)] truncate mt-0.5 leading-tight'>
               {track.artist.name}
               {track.album?.title ? ` · ${track.album.title}` : ""}
            </p>
         </div>

         {/* Actions */}
         <div className='flex items-center gap-1.5 flex-shrink-0'>
            <span className='text-xs text-[var(--text-muted)] tabular-nums hidden sm:block'>
               {formatDuration(track.duration)}
            </span>
            <motion.button
               whileTap={{ scale: 0.85 }}
               onClick={onDownload}
               className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                  // Always visible on mobile (no hover-only)
                  track.isDownloaded
                     ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
                     : "bg-[var(--bg-elevated)] text-[var(--text-muted)] active:bg-[var(--accent-subtle)] active:text-[var(--accent)]"
               )}>
               <Download className='w-3.5 h-3.5' />
            </motion.button>
         </div>
      </motion.div>
   );
}

// ── Album card ────────────────────────────────────────────────

function AlbumCard({
   album,
   index,
   onClick
}: {
   album: any;
   index: number;
   onClick?: () => void;
}) {
   const artistName =
      typeof album.artist === "string"
         ? album.artist
         : (album.artist?.name ?? "");

   return (
      <motion.div
         initial={{ opacity: 0, scale: 0.92 }}
         animate={{ opacity: 1, scale: 1 }}
         transition={{ delay: index * 0.04 }}
         whileTap={{ scale: 0.96 }}
         onClick={onClick}
         className='flex-shrink-0 w-36 cursor-pointer group'>
         <div
            className='relative w-36 h-36 rounded-2xl overflow-hidden mb-2 shadow-md
                      border border-[var(--border)] group-active:opacity-80 transition-opacity'>
            {album.artworkUrl ? (
               <img
                  src={album.artworkUrl}
                  alt={album.title}
                  className='w-full h-full object-cover'
                  onError={e => {
                     (e.target as HTMLImageElement).src = "/assets/logo.png";
                  }}
               />
            ) : (
               <div
                  className='w-full h-full bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-surface)]
                            flex items-center justify-center'>
                  <Disc3 className='w-10 h-10 text-[var(--text-muted)]' />
               </div>
            )}
         </div>
         <p className='text-xs font-semibold text-[var(--text-primary)] truncate leading-tight'>
            {album.title}
         </p>
         <p className='text-[10px] text-[var(--text-muted)] truncate mt-0.5'>
            {artistName}
         </p>
      </motion.div>
   );
}

// ── Artist pill ───────────────────────────────────────────────

function ArtistPill({
   artist,
   index,
   onClick
}: {
   artist: any;
   index: number;
   onClick?: () => void;
}) {
   return (
      <motion.div
         initial={{ opacity: 0, scale: 0.88 }}
         animate={{ opacity: 1, scale: 1 }}
         transition={{ delay: index * 0.05 }}
         whileTap={{ scale: 0.94 }}
         onClick={onClick}
         className='flex-shrink-0 flex flex-col items-center gap-2 w-20 cursor-pointer'>
         <div
            className='w-16 h-16 rounded-full overflow-hidden border-2 border-[var(--border)]
                      bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-surface)]
                      flex items-center justify-center'>
            {artist.imageUrl ? (
               <img
                  src={artist.imageUrl}
                  alt={artist.name}
                  className='w-full h-full object-cover'
                  onError={e => {
                     (e.target as HTMLImageElement).src = "/assets/logo.png";
                  }}
               />
            ) : (
               <User className='w-7 h-7 text-[var(--text-muted)]' />
            )}
         </div>
         <p className='text-[10px] font-semibold text-[var(--text-primary)] text-center truncate w-full leading-tight'>
            {artist.name}
         </p>
      </motion.div>
   );
}

// ── Playlist card ─────────────────────────────────────────────

function PlaylistCard({
   playlist,
   index,
   onClick
}: {
   playlist: any;
   index: number;
   onClick?: () => void;
}) {
   return (
      <motion.div
         initial={{ opacity: 0, scale: 0.92 }}
         animate={{ opacity: 1, scale: 1 }}
         transition={{ delay: index * 0.04 }}
         whileTap={{ scale: 0.96 }}
         onClick={onClick}
         className='flex-shrink-0 w-36 cursor-pointer group'>
         <div
            className='relative w-36 h-36 rounded-2xl overflow-hidden mb-2 shadow-md
                      border border-[var(--border)] group-active:opacity-80 transition-opacity'>
            {playlist.artworkUrl ? (
               <img
                  src={playlist.artworkUrl}
                  alt={playlist.title}
                  className='w-full h-full object-cover'
                  onError={e => {
                     (e.target as HTMLImageElement).src = "/assets/logo.png";
                  }}
               />
            ) : (
               <div
                  className='w-full h-full bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-surface)]
                            flex items-center justify-center'>
                  <ListMusic className='w-10 h-10 text-[var(--text-muted)]' />
               </div>
            )}
         </div>
         <p className='text-xs font-semibold text-[var(--text-primary)] truncate leading-tight'>
            {playlist.title}
         </p>
         <p className='text-[10px] text-[var(--text-muted)] truncate mt-0.5'>
            {playlist.trackCount ? `${playlist.trackCount} songs` : "Playlist"}
         </p>
      </motion.div>
   );
}

// ── Main page ─────────────────────────────────────────────────

export default function Search() {
   const {
      query,
      setQuery,
      filter,
      setFilter,
      results,
      isLoading,
      error,
      clear,
      suggestions,
      selectSuggestion,
      handleSubmit
   } = useSearch();

   const { playTrack } = useQueue();
   const { openDownloadModal } = useUIStore();
   const { toast } = useToast();

   const inputType = query ? detectInputType(query) : "query";
   const hasResults =
      results &&
      (results.tracks.length > 0 ||
         results.albums.length > 0 ||
         results.artists.length > 0 ||
         results.playlists.length > 0);

   const handlePlay = (track: Track, queue: Track[]) => {
      playTrack(track, queue);
      toast(`Playing ${truncate(track.title, 28)}`, "success", 2500);
   };

   const handleDownload = (
      e: React.MouseEvent,
      trackId: string,
      title: string
   ) => {
      e.stopPropagation();
      openDownloadModal(trackId);
      toast(`Added "${truncate(title, 24)}" to downloads`, "info", 2500);
   };

   return (
      <div className='flex flex-col h-full'>
         {/* ── Header ──────────────────────────────────────────── */}
         <div className='px-4 pt-6 pb-3 space-y-3 flex-shrink-0'>
            <div className='flex items-center justify-between'>
               <h1 className='text-2xl font-bold text-[var(--text-primary)]'>
                  Search
               </h1>
               {/* Link type indicator in header */}
               {(inputType === "spotify" || inputType === "youtube") && (
                  <motion.div
                     initial={{ opacity: 0, scale: 0.85 }}
                     animate={{ opacity: 1, scale: 1 }}
                     className='flex items-center gap-1.5 px-3 py-1 rounded-full
                         bg-[var(--accent-subtle)] border border-[var(--accent-border)]'>
                     <Link2 className='w-3 h-3 text-[var(--accent)]' />
                     <span className='text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider'>
                        {inputType === "spotify" ? "Spotify" : "YouTube"}
                     </span>
                  </motion.div>
               )}
            </div>

            <SearchBar
               query={query}
               onChange={setQuery}
               onClear={clear}
               onSubmit={handleSubmit}
               isLoading={isLoading}
               suggestions={suggestions}
               onSelectSuggestion={selectSuggestion}
            />

            {/* Filter pills — only when there are results */}
            <AnimatePresence>
               {query && results && (
                  <motion.div
                     initial={{ opacity: 0, height: 0 }}
                     animate={{ opacity: 1, height: "auto" }}
                     exit={{ opacity: 0, height: 0 }}
                     className='flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5'>
                     {FILTERS.map(f => (
                        <motion.button
                           key={f.id}
                           whileTap={{ scale: 0.92 }}
                           onClick={() => setFilter(f.id)}
                           className={cn(
                              "flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold min-h-[36px]",
                              "border transition-all duration-200",
                              filter === f.id
                                 ? "bg-[var(--accent)] border-[var(--accent)] text-white shadow-lg"
                                 : "bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)]"
                           )}>
                           {f.label}
                        </motion.button>
                     ))}
                  </motion.div>
               )}
            </AnimatePresence>
         </div>

         {/* ── Content ─────────────────────────────────────────── */}
         <ScrollArea className='flex-1 px-4 pb-6'>
            <AnimatePresence mode='wait'>
               {/* Categories (idle state) */}
               {!query && (
                  <motion.div
                     key='categories'
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}>
                     <div className='flex items-center gap-2 mb-4 mt-2'>
                        <TrendingUp className='w-4 h-4 text-[var(--accent)]' />
                        <p className='text-sm font-bold text-[var(--text-primary)]'>
                           Browse categories
                        </p>
                     </div>
                     <CategoryGrid onSelect={cat => setQuery(cat)} />
                  </motion.div>
               )}

               {/* Loading */}
               {query && isLoading && (
                  <motion.div
                     key='loading'
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     className='flex flex-col items-center justify-center py-20 gap-4'>
                     <Spinner size='lg' />
                     <p className='text-sm text-[var(--text-muted)]'>
                        {inputType === "spotify" || inputType === "youtube"
                           ? "Resolving link…"
                           : `Searching for "${truncate(query, 20)}"…`}
                     </p>
                  </motion.div>
               )}

               {/* Error */}
               {!isLoading && error && (
                  <motion.div
                     key='error'
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     className='flex flex-col items-center py-20 gap-4 text-center'>
                     <div className='w-16 h-16 rounded-3xl bg-red-500/10 flex items-center justify-center'>
                        <X className='w-7 h-7 text-red-400' />
                     </div>
                     <div>
                        <p className='font-semibold text-[var(--text-primary)]'>
                           Search failed
                        </p>
                        <p className='text-sm text-[var(--text-secondary)] mt-1'>
                           {error}
                        </p>
                     </div>
                     <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={clear}
                        className='px-5 py-2 rounded-full bg-[var(--bg-elevated)] text-sm
                           font-semibold text-[var(--text-primary)] border border-[var(--border)]'>
                        Clear
                     </motion.button>
                  </motion.div>
               )}

               {/* Results */}
               {!isLoading && !error && results && (
                  <motion.div
                     key='results'
                     initial={{ opacity: 0, y: 6 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0 }}
                     className='space-y-6 pb-4 mt-2'>
                     {/* Tracks */}
                     {results.tracks.length > 0 && (
                        <ResultSection
                           title='Tracks'
                           count={results.tracks.length}
                           icon={<Music2 className='w-4 h-4' />}>
                           <div className='space-y-0.5'>
                              {results.tracks.map((track, i) => (
                                 <TrackRow
                                    key={track.id}
                                    track={track}
                                    index={i}
                                    onPlay={() =>
                                       handlePlay(track, results.tracks)
                                    }
                                    onDownload={e =>
                                       handleDownload(e, track.id, track.title)
                                    }
                                 />
                              ))}
                           </div>
                        </ResultSection>
                     )}

                     {/* Artists */}
                     {results.artists.length > 0 && (
                        <ResultSection
                           title='Artists'
                           count={results.artists.length}
                           icon={<User className='w-4 h-4' />}>
                           <div className='flex gap-5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1'>
                              {results.artists.map((artist, i) => (
                                 <ArtistPill
                                    key={artist.id || i}
                                    artist={artist}
                                    index={i}
                                 />
                              ))}
                           </div>
                        </ResultSection>
                     )}

                     {/* Albums */}
                     {results.albums.length > 0 && (
                        <ResultSection
                           title='Albums'
                           count={results.albums.length}
                           icon={<Disc3 className='w-4 h-4' />}>
                           <div className='flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1'>
                              {results.albums.map((album, i) => (
                                 <AlbumCard
                                    key={album.id || i}
                                    album={album}
                                    index={i}
                                 />
                              ))}
                           </div>
                        </ResultSection>
                     )}

                     {/* Empty state */}
                     {!hasResults && (
                        <motion.div
                           initial={{ opacity: 0 }}
                           animate={{ opacity: 1 }}
                           className='flex flex-col items-center py-20 gap-4 text-center'>
                           <div className='w-16 h-16 rounded-3xl bg-[var(--bg-elevated)] flex items-center justify-center'>
                              <SearchIcon className='w-7 h-7 text-[var(--text-muted)]' />
                           </div>
                           <div>
                              <p className='font-semibold text-[var(--text-primary)]'>
                                 No results for "{truncate(query, 22)}"
                              </p>
                              <p className='text-sm text-[var(--text-muted)] mt-1'>
                                 Try a different search or paste a Spotify /
                                 YouTube link
                              </p>
                           </div>
                        </motion.div>
                     )}
                  </motion.div>
               )}
            </AnimatePresence>
         </ScrollArea>
      </div>
   );
}
