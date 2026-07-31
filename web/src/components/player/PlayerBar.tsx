import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Heart,
    MoreHorizontal,
    ListMusic,
    Mic2,
    Download,
    WifiOff
} from 'lucide-react';
import { usePlayerStore } from '@/store/playerStore';
import { useUIStore } from '@/store/uiStore';
import { usePlayer } from '@/hooks/usePlayer';
import { tracksApi } from '@/api/tracks';
import PlayerControls from './PlayerControls';
import ProgressBar from './ProgressBar';
import VolumeControl from './VolumeControl';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/utils';
import { truncate } from '@/lib/formatters';

export default function PlayerBar() {
    const navigate = useNavigate();
    const currentTrack = usePlayerStore(s => s.currentTrack);
    const isPlaying = usePlayerStore(s => s.isPlaying);
    const isLoading = usePlayerStore(s => s.isLoading);
    const {
        showQueue,
        showLyrics,
        toggleQueue,
        toggleLyrics,
        openDownloadModal
    } = useUIStore();

    // Local liked state — kept in sync with the track's isLiked flag.
    // FIX: previously used useState with no key, so switching tracks didn't
    // reset liked. Now keyed to currentTrack.id via the useEffect below.
    const [liked, setLiked] = useState(currentTrack?.isLiked ?? false);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Sync liked state whenever the track changes
    useEffect(() => {
        setLiked(currentTrack?.isLiked ?? false);
    }, [currentTrack?.id]);

    // Close menu on outside click
    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node))
                setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const handleLike = useCallback(
        async (e: React.MouseEvent) => {
            e.stopPropagation();
            if (!currentTrack) return;
            const next = !liked;
            setLiked(next);
            try {
                // FIX: unlikeTrack must use DELETE (api.delete), not POST.
                // tracksApi.unlikeTrack already calls api.delete — verified in api/tracks.ts.
                next
                    ? await tracksApi.likeTrack(currentTrack.id)
                    : await tracksApi.unlikeTrack(currentTrack.id);
            } catch {
                setLiked(!next); // revert on failure
            }
        },
        [currentTrack, liked]
    );

    if (!currentTrack) return null;

    return (
        <AnimatePresence>
            <motion.div
                key='player-bar'
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className='relative z-30 w-full glass-strong border-t border-[var(--border)] px-4 py-3'
                style={{ height: 'var(--player-height)' }}
            >
                {/* Thin progress line at very top of bar */}
                <div className='absolute top-0 inset-x-0'>
                    <ProgressBar compact />
                </div>

                <div className='flex items-center gap-3 h-full'>
                    {/* Track info → taps to Now Playing */}
                    <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => navigate('/now-playing')}
                        className='flex items-center gap-3 flex-1 min-w-0 text-left'
                    >
                        {/* Artwork */}
                        <div className='relative flex-shrink-0'>
                            <motion.img
                                key={currentTrack.artworkUrl}
                                src={
                                    currentTrack.artworkUrl ||
                                    '/assets/logo.png'
                                }
                                alt={currentTrack.title}
                                className='w-11 h-11 rounded-xl object-cover shadow-lg'
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: 'spring', damping: 20 }}
                                onError={e => {
                                    (e.target as HTMLImageElement).src =
                                        '/assets/logo.png';
                                }}
                            />

                            {/* Loading pulse */}
                            {isLoading && (
                                <div className='absolute inset-0 rounded-xl border-2 border-[var(--accent)] animate-pulse' />
                            )}

                            {/* Offline badge (downloaded) */}
                            {!isLoading && currentTrack.isDownloaded && (
                                <div className='absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--accent)] flex items-center justify-center'>
                                    <WifiOff className='w-2 h-2 text-white' />
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
                                {truncate(currentTrack.artist.name, 22)}
                            </p>
                        </div>
                    </motion.button>

                    {/* Like button */}
                    <motion.button
                        whileTap={{ scale: 0.8 }}
                        onClick={handleLike}
                        className='flex-shrink-0 p-1'
                    >
                        <Heart
                            className={cn(
                                'w-4 h-4 transition-all duration-200',
                                liked
                                    ? 'text-[var(--accent)] fill-current'
                                    : 'text-[var(--text-muted)]'
                            )}
                        />
                    </motion.button>

                    {/* Centre controls (desktop) */}
                    <div className='hidden sm:flex items-center'>
                        <PlayerControls compact />
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
                            active={showLyrics}
                            onClick={toggleLyrics}
                            title='Lyrics'
                        >
                            <Mic2 />
                        </IconButton>
                        <IconButton
                            size='sm'
                            variant='ghost'
                            active={showQueue}
                            onClick={toggleQueue}
                            title='Queue'
                        >
                            <ListMusic />
                        </IconButton>
                    </div>

                    {/* Three-dot overflow menu */}
                    <div className='relative flex-shrink-0' ref={menuRef}>
                        <IconButton
                            size='sm'
                            variant='ghost'
                            onClick={e => {
                                e.stopPropagation();
                                setMenuOpen(!menuOpen);
                            }}
                        >
                            <MoreHorizontal />
                        </IconButton>

                        <AnimatePresence>
                            {menuOpen && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: 8 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: 8 }}
                                    transition={{
                                        type: 'spring',
                                        damping: 25,
                                        stiffness: 350
                                    }}
                                    className='absolute bottom-full right-0 mb-2 z-50 w-52 glass-strong rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden'
                                >
                                    {[
                                        {
                                            label: liked
                                                ? 'Remove from liked'
                                                : 'Like song',
                                            icon: (
                                                <Heart
                                                    className={cn(
                                                        'w-4 h-4',
                                                        liked &&
                                                            'fill-current text-[var(--accent)]'
                                                    )}
                                                />
                                            ),
                                            action: (e: React.MouseEvent) => {
                                                handleLike(e);
                                                setMenuOpen(false);
                                            }
                                        },
                                        {
                                            label: 'Download',
                                            icon: (
                                                <Download className='w-4 h-4' />
                                            ),
                                            action: () => {
                                                openDownloadModal(
                                                    currentTrack.id
                                                );
                                                setMenuOpen(false);
                                            }
                                        },
                                        {
                                            label: showLyrics
                                                ? 'Hide lyrics'
                                                : 'Show lyrics',
                                            icon: <Mic2 className='w-4 h-4' />,
                                            action: () => {
                                                toggleLyrics();
                                                setMenuOpen(false);
                                            }
                                        },
                                        {
                                            label: showQueue
                                                ? 'Hide queue'
                                                : 'Show queue',
                                            icon: (
                                                <ListMusic className='w-4 h-4' />
                                            ),
                                            action: () => {
                                                toggleQueue();
                                                setMenuOpen(false);
                                            }
                                        }
                                    ].map(item => (
                                        <motion.button
                                            key={item.label}
                                            whileHover={{
                                                backgroundColor:
                                                    'var(--bg-elevated)'
                                            }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={item.action as any}
                                            className='w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--border)] last:border-0 transition-colors'
                                        >
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
            </motion.div>
        </AnimatePresence>
    );
}
