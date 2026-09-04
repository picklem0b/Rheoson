import {
    useState,
    useCallback,
    useEffect,
    createContext,
    useContext,
    useRef
} from "react";
import { AnimatePresence } from "framer-motion";
import { Toast, type ToastData, type ToastType } from "./Toast";
import { uid } from "@/lib/utils";
import { playChime } from "@/lib/sounds";

// ── Context ───────────────────────────────────────────────────

interface ToasterContextValue {
    toast: (message: string, type?: ToastType, duration?: number) => string;
    dismiss: (id: string) => void;
}

const ToasterContext = createContext<ToasterContextValue>({
    toast: () => "",
    dismiss: () => {}
});

export const useToast = () => useContext(ToasterContext);

// ── Provider ──────────────────────────────────────────────────

export function Toaster({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastData[]>([]);
    const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
        new Map()
    );

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
    }, []);

    const toast = useCallback(
        (
            message: string,
            type: ToastType = "info",
            duration: number = 3000
        ): string => {
            const id = uid("toast");
            setToasts(prev => {
                // Cap at 4 toasts — pop the oldest if we're over
                const next = [...prev, { id, type, message, duration }];
                return next.length > 4 ? next.slice(next.length - 4) : next;
            });

            // Subtle chime on success toasts (download queued, track liked, etc.)
            // Honours Settings → Notifications → "Sound effects".
            if (type === "success") playChime();

            const timer = setTimeout(() => dismiss(id), duration);
            timers.current.set(id, timer);
            return id;
        },
        [dismiss]
    );

    // Clear all timers on unmount
    useEffect(
        () => () => {
            timers.current.forEach(clearTimeout);
            timers.current.clear();
        },
        []
    );

    return (
        <ToasterContext.Provider value={{ toast, dismiss }}>
            {children}

            {/*
        ── Toast stack position ────────────────────────────────
        Mobile: bottom-centre, above the player bar and bottom nav.
        Desktop: top-right corner (classic).

        The player bar is --player-height tall and the bottom nav
        is --nav-height tall. We add a little padding on top of that
        so toasts don't overlap the nav on mobile.
      */}
            <div
                className="fixed z-[200] flex flex-col items-center gap-2 pointer-events-none
                   bottom-[calc(var(--player-height,72px)+var(--nav-height,64px)+12px)]
                   inset-x-4
                   sm:bottom-auto sm:top-5 sm:right-5 sm:left-auto sm:items-end"
            >
                <div className="pointer-events-auto flex flex-col gap-2 w-full sm:w-auto">
                    <AnimatePresence mode="popLayout">
                        {toasts.map(t => (
                            <Toast key={t.id} {...t} onDismiss={dismiss} />
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </ToasterContext.Provider>
    );
}
