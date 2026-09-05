import { motion } from 'framer-motion';
import { Play, Pause, Heart, ListPlus, Music2 } from 'lucide-react';
import { useQueue } from '@/hooks/queue.hook';
import { usePlayer } from '@/hooks/player.hook';
import { usePlayerStore } from '@/store/player.store';
import { usePlaylistMenuStore } from '@/store/playlistMenu.store';
import { useTrackContextMenu } from '@/hooks/useTrackContextMenu';
import { tracksApi } from '@/api/tracks.api';
import { useQueryClient } from '@tanstack/react-query';
import { formatDuration } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { Track } from '@/types/track.types';

interface LibraryTrackRowProps {
    track: Track;
    index: number;
}

export default function LibraryTrackRow({
    track,
    index
}: LibraryTrackRowProps) {
    const { playTrack } = useQueue();
    const { togglePlay } = usePlayer();
    const currentTrack = usePlayerStore(s => s.currentTrack);
    const isPlaying = usePlayerStore(s => s.isPlaying);
    const queryClient = useQueryClient();
    const contextMenu = useTrackContextMenu(track);

    const active = currentTrack?.id === track.id;

    const handlePlay = () => {
        if (active) {
            togglePlay();
        } else {
            playTrack(track, [track]);
        }
    };

    const handleLike = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (track.isLiked) {
            await tracksApi.unlikeTrack(track.id);
        } else {
            await tracksApi.likeTrack(track.id);
        }
        queryClient.invalidateQueries({ queryKey: ['tracks'] });
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.3) }}
            whileHover={{ backgroundColor: 'var(--bg-elevated)' }}
            whileTap={{ scale: 0.99 }}
            onClick={handlePlay}
            role='button'
            tabIndex={0}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handlePlay();
                }
            }}
            {...contextMenu}
            className='w-full group flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors text-left cursor-pointer'
        >
            {/* Artwork with play overlay */}
            <div className='relative flex-shrink-0'>
                {track.artworkUrl ? (
                    <img
                        src={track.artworkUrl}
                        alt={track.title}
                        className='w-12 h-12 rounded-xl object-cover'
                    />
                ) : (
                    <div className='w-12 h-12 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center'>
                        <Music2 className='w-5 h-5 text-[var(--text-muted)]' />
                    </div>
                )}

                <div
                    className={cn(
                        'absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center transition-opacity',
                        active
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100'
                    )}
                >
                    {active && isPlaying ? (
                        <Pause className='w-4 h-4 text-white fill-current' />
                    ) : (
                        <Play className='w-4 h-4 text-white fill-current ml-0.5' />
                    )}
                </div>
            </div>

            {/* Title + artist */}
            <div className='flex-1 min-w-0'>
                <p
                    className={cn(
                        'text-sm font-semibold truncate',
                        active
                            ? 'text-[var(--accent)]'
                            : 'text-[var(--text-primary)]'
                    )}
                >
                    {track.title}
                </p>

                <p className='text-xs text-[var(--text-secondary)] truncate'>
                    {track.artist.name}
                </p>
            </div>

            {/* Duration */}
            <span className='text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0'>
                {formatDuration(track.duration)}
            </span>

            {/* Like button */}
            <button
                type='button'
                onClick={handleLike}
                className='flex-shrink-0 p-1.5 -mr-1'
                aria-label={track.isLiked ? 'Unlike' : 'Like'}
            >
                <Heart
                    className={cn(
                        'w-4 h-4 transition-colors',
                        track.isLiked
                            ? 'text-[var(--accent)] fill-current'
                            : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100'
                    )}
                />
            </button>

            {/* Add to playlist */}
            <button
                type='button'
                onClick={e => {
                    e.stopPropagation();
                    usePlaylistMenuStore.getState().openForTrack(track);
                }}
                className='flex-shrink-0 p-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity'
                aria-label='Add to playlist'
            >
                <ListPlus className='w-4 h-4 text-[var(--text-muted)]' />
            </button>
        </motion.div>
    );
}
