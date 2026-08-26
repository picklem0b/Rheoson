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
    Download
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { IconButton } from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toaster";
import { getPlaylists } from "@/api/playlists.api";
import { getAlbums, getArtists } from "@/api/library.api";
import { tracksApi } from "@/api/tracks.api";
import { useUIStore } from "@/store/ui.store";
import { cn } from "@/lib/utils";
import type { Artist } from "@/types/track.types";

type LibTab = "playlists" | "albums" | "artists";

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

function GridSkeleton() {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                    <Skeleton className="aspect-square rounded-3xl" />
                    <Skeleton className="h-3 w-3/4 rounded-full" />
                    <Skeleton className="h-3 w-1/2 rounded-full" />
                </div>
            ))}
        </div>
    );
}

function ListSkeleton() {
    return (
        <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <Skeleton className="w-14 h-14 rounded-2xl flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-3/4 rounded-full" />
                        <Skeleton className="h-3 w-1/2 rounded-full" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Grid view ─────────────────────────────────────────────────

function GridView({
    items,
    onSelect
}: {
    items: any[];
    onSelect: (id: string) => void;
}) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-4">
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
                    className="text-left group"
                >
                    {/* Artwork */}
                    <div
                        className={cn(
                            "w-full aspect-square rounded-3xl mb-2.5 relative overflow-hidden",
                            "border border-[var(--border)] shadow-md",
                            !item.artworkUrl &&
                                `bg-gradient-to-br ${gradient(i)}`
                        )}
                    >
                        {item.artworkUrl ? (
                            <img
                                src={item.artworkUrl}
                                alt={item.title}
                                className="w-full h-full object-cover"
                                onError={e => {
                                    (e.target as HTMLImageElement).src =
                                        "/assets/logo.png";
                                }}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                {"artist" in item ? (
                                    <Disc3 className="w-10 h-10 text-white/40" />
                                ) : (
                                    <Music2 className="w-10 h-10 text-white/40" />
                                )}
                            </div>
                        )}

                        {/* Play button on tap */}
                        <div
                            className="absolute inset-0 bg-black/30 opacity-0 group-active:opacity-100
                            transition-opacity flex items-center justify-center"
                        >
                            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
                                <Play className="w-5 h-5 text-black fill-current translate-x-0.5" />
                            </div>
                        </div>
                    </div>

                    <p className="text-sm font-bold text-[var(--text-primary)] truncate leading-tight">
                        {item.title}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 leading-tight">
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
    items: any[];
    onSelect: (id: string) => void;
}) {
    return (
        <div className="space-y-1 pb-4">
            {items.map((item, i) => (
                <motion.button
                    key={item.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.025 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onSelect(item.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl
                     hover:bg-[var(--bg-elevated)] active:bg-[var(--bg-elevated)]
                     transition-colors text-left group"
                >
                    {/* Artwork */}
                    <div
                        className={cn(
                            "w-14 h-14 rounded-2xl flex-shrink-0 overflow-hidden border border-[var(--border)]",
                            !item.artworkUrl &&
                                `bg-gradient-to-br ${gradient(i)}`,
                            "flex items-center justify-center"
                        )}
                    >
                        {item.artworkUrl ? (
                            <img
                                src={item.artworkUrl}
                                alt={item.title}
                                className="w-full h-full object-cover"
                                onError={e => {
                                    (e.target as HTMLImageElement).src =
                                        "/assets/logo.png";
                                }}
                            />
                        ) : "artist" in item ? (
                            <Disc3 className="w-6 h-6 text-white/50" />
                        ) : (
                            <Music2 className="w-6 h-6 text-white/50" />
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight">
                            {item.title}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 leading-tight">
                            {"artist" in item
                                ? (item.artist?.name ?? "")
                                : item.trackCount != null
                                  ? `${item.trackCount} songs`
                                  : ""}
                        </p>
                    </div>

                    <ChevronRight
                        className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0
                                   opacity-0 group-hover:opacity-100 group-active:opacity-100
                                   transition-opacity"
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
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-4 pb-4">
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
                    className="flex flex-col items-center gap-2 group"
                >
                    <div
                        className={cn(
                            "w-full aspect-square rounded-full overflow-hidden",
                            "border-2 border-[var(--border)] group-active:border-[var(--accent)]",
                            "transition-colors shadow-md",
                            !artist.imageUrl &&
                                `bg-gradient-to-br ${gradient(i)}`,
                            "flex items-center justify-center"
                        )}
                    >
                        {artist.imageUrl ? (
                            <img
                                src={artist.imageUrl}
                                alt={artist.name}
                                className="w-full h-full object-cover"
                                onError={e => {
                                    (e.target as HTMLImageElement).src =
                                        "/assets/logo.png";
                                }}
                            />
                        ) : (
                            <User className="w-6 h-6 text-white/50" />
                        )}
                    </div>
                    <p
                        className="text-xs font-semibold text-[var(--text-primary)] text-center
                        truncate w-full leading-tight"
                    >
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
            icon: <Music2 className="w-8 h-8 text-[var(--text-muted)]" />,
            text: "No playlists yet",
            sub: "Create your first playlist"
        },
        albums: {
            icon: <Disc3 className="w-8 h-8 text-[var(--text-muted)]" />,
            text: "No albums saved",
            sub: "Albums from your downloads appear here"
        },
        artists: {
            icon: <User className="w-8 h-8 text-[var(--text-muted)]" />,
            text: "No artists saved",
            sub: "Artists from your downloads appear here"
        }
    };
    const m = messages[tab];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-4 text-center"
        >
            <div className="w-16 h-16 rounded-3xl bg-[var(--bg-elevated)] flex items-center justify-center">
                {m.icon}
            </div>
            <div>
                <p className="font-semibold text-[var(--text-primary)]">
                    {m.text}
                </p>
                <p className="text-sm text-[var(--text-muted)] mt-1">{m.sub}</p>
            </div>
            {tab === "playlists" && (
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={onCreate}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full
                     bg-[var(--accent)] text-white text-sm font-bold shadow-lg"
                >
                    <Plus className="w-4 h-4" />
                    New Playlist
                </motion.button>
            )}
        </motion.div>
    );
}

// ── Main page ─────────────────────────────────────────────────

const TABS: { id: LibTab; label: string; icon: React.ReactNode }[] = [
    {
        id: "playlists",
        label: "Playlists",
        icon: <Music2 className="w-3.5 h-3.5" />
    },
    { id: "albums", label: "Albums", icon: <Disc3 className="w-3.5 h-3.5" /> },
    { id: "artists", label: "Artists", icon: <User className="w-3.5 h-3.5" /> }
];

export default function Library() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { openDownloadModal } = useUIStore();

    const [tab, setTab] = useState<LibTab>("playlists");
    const [grid, setGrid] = useState(true);

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

    const { data: likedCount } = useQuery({
        queryKey: ["liked-count"],
        queryFn: () => tracksApi.getLikedCount()
    });

    const isLoading =
        (tab === "playlists" && loadingPlaylists) ||
        (tab === "albums" && loadingAlbums) ||
        (tab === "artists" && loadingArtists);

    const currentItems =
        tab === "playlists"
            ? (playlists ?? [])
            : tab === "albums"
              ? (albums ?? [])
              : [];

    const handleCreate = () => {
        navigate("/library/new");
        toast("Creating new playlist", "info", 2000);
    };

    return (
        <div className="flex flex-col h-full">
            {/* ── Header ──────────────────────────────────────────── */}
            <div className="px-4 pt-6 pb-3 flex-shrink-0 space-y-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                        Library
                    </h1>
                    <div className="flex items-center gap-1">
                        {/* Grid/List toggle — only for playlists + albums */}
                        {tab !== "artists" && (
                            <IconButton
                                size="sm"
                                variant="ghost"
                                onClick={() => setGrid(!grid)}
                                title={grid ? "List view" : "Grid view"}
                            >
                                {grid ? <List /> : <Grid3X3 />}
                            </IconButton>
                        )}
                        <IconButton
                            size="sm"
                            variant="accent"
                            onClick={handleCreate}
                            title="New playlist"
                        >
                            <Plus />
                        </IconButton>
                    </div>
                </div>

                {/* Tab pills */}
                <div className="flex gap-2">
                    {TABS.map(t => (
                        <motion.button
                            key={t.id}
                            whileTap={{ scale: 0.93 }}
                            onClick={() => setTab(t.id)}
                            className={cn(
                                "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold",
                                "transition-all duration-200",
                                t.id === tab
                                    ? "bg-[var(--text-primary)] text-[var(--bg-base)] shadow-md"
                                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]"
                            )}
                        >
                            {t.icon}
                            {t.label}
                        </motion.button>
                    ))}
                </div>
            </div>

            <ScrollArea className="flex-1 px-4 pb-6">
                {/* ── Liked Songs — always pinned at top ──────────── */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate("/liked")}
                    className="w-full flex items-center gap-4 p-4 rounded-3xl mb-5 mt-1
                     bg-gradient-to-r from-violet-900/50 to-purple-800/30
                     border border-violet-500/20 active:border-violet-500/40
                     transition-all duration-200 text-left group"
                >
                    {/* Icon */}
                    <div
                        className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500
                          flex items-center justify-center shadow-lg flex-shrink-0"
                    >
                        <Heart className="w-6 h-6 text-white fill-current" />
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-[var(--text-primary)] leading-tight">
                            Liked Songs
                        </p>
                        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                            {typeof likedCount === "number"
                                ? `${likedCount} ${likedCount === 1 ? "song" : "songs"}`
                                : "—"}
                        </p>
                    </div>

                    <ChevronRight
                        className="w-5 h-5 text-[var(--text-muted)] flex-shrink-0
                                   opacity-60 group-hover:opacity-100 transition-opacity"
                    />
                </motion.button>

                {/* ── Tab content ──────────────────────────────────── */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={tab}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                    >
                        {isLoading &&
                            (grid ? <GridSkeleton /> : <ListSkeleton />)}

                        {!isLoading &&
                            tab !== "artists" &&
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

                        {!isLoading &&
                            tab === "artists" &&
                            (!artists || artists.length === 0 ? (
                                <EmptyState
                                    tab="artists"
                                    onCreate={handleCreate}
                                />
                            ) : (
                                <ArtistGrid
                                    artists={artists}
                                    onSelect={id => navigate(`/artist/${id}`)}
                                />
                            ))}
                    </motion.div>
                </AnimatePresence>
            </ScrollArea>
        </div>
    );
}
