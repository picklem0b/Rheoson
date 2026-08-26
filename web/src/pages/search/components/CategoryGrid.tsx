import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ── Categories ────────────────────────────────────────────────

const CATEGORIES = [
    {
        label: "Hip-Hop",
        gradient: "from-yellow-900/90 to-orange-800/90",
        emoji: "🎤"
    },
    {
        label: "Electronic",
        gradient: "from-cyan-900/90 to-blue-800/90",
        emoji: "🎛️"
    },
    { label: "R&B", gradient: "from-rose-900/90 to-pink-800/90", emoji: "🎶" },
    { label: "Rock", gradient: "from-zinc-900/90 to-zinc-700/90", emoji: "🎸" },
    {
        label: "Afrobeats",
        gradient: "from-green-900/90 to-emerald-700/90",
        emoji: "🪘"
    },
    {
        label: "Jazz",
        gradient: "from-amber-900/90 to-yellow-700/90",
        emoji: "🎷"
    },
    {
        label: "Pop",
        gradient: "from-violet-900/90 to-purple-700/90",
        emoji: "✨"
    },
    {
        label: "Classical",
        gradient: "from-slate-900/90 to-slate-700/90",
        emoji: "🎻"
    },
    { label: "Soul", gradient: "from-red-900/90 to-rose-800/90", emoji: "🎙️" },
    {
        label: "Drill",
        gradient: "from-neutral-900/90 to-stone-700/90",
        emoji: "🥁"
    }
];

interface CategoryGridProps {
    onSelect: (category: string) => void;
}

export function CategoryGrid({ onSelect }: CategoryGridProps) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pb-6">
            {CATEGORIES.map((cat, i) => (
                <motion.button
                    key={cat.label}
                    initial={{ opacity: 0, scale: 0.88 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                        delay: i * 0.04,
                        type: "spring",
                        damping: 20,
                        stiffness: 260
                    }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onSelect(cat.label)}
                    className={cn(
                        "h-[72px] rounded-2xl overflow-hidden relative bg-gradient-to-br",
                        cat.gradient,
                        "border border-white/5 shadow-md active:brightness-110 transition-all"
                    )}
                >
                    {/* Emoji top-right */}
                    <span className="absolute top-2.5 right-3 text-lg select-none opacity-60">
                        {cat.emoji}
                    </span>
                    <span className="absolute bottom-2.5 left-3 text-sm font-bold text-white drop-shadow-sm">
                        {cat.label}
                    </span>
                </motion.button>
            ))}
        </div>
    );
}

// ── ResultSection ─────────────────────────────────────────────

interface ResultSectionProps {
    title: string;
    count: number;
    icon?: React.ReactNode;
    children: React.ReactNode;
}

export function ResultSection({
    title,
    count,
    icon,
    children
}: ResultSectionProps) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                {icon && <span className="text-[var(--accent)]">{icon}</span>}
                <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    {title}
                </h3>
                <span
                    className="text-xs font-semibold text-[var(--text-muted)] bg-[var(--bg-elevated)]
                         px-2 py-0.5 rounded-full tabular-nums"
                >
                    {count}
                </span>
            </div>
            {children}
        </div>
    );
}
