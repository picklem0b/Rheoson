import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NavStyle = "pill" | "flat" | "minimal";
export type NavPosition = "bottom" | "top";
export type FontFamily = "plus-jakarta" | "inter" | "system";
export type FontSize = "small" | "default" | "large";

interface UIStore {
   // ── Panels ────────────────────────────────────────────────
   showQueue: boolean;
   showLyrics: boolean;
   showFullscreen: boolean;
   showDownloads: boolean;

   // ── Sidebar (desktop) ─────────────────────────────────────
   sidebarCollapsed: boolean;

   // ── Modals ────────────────────────────────────────────────
   downloadModalTrackId: string | null;

   // ── Layout preferences (Settings → Layout) ────────────────
   navStyle: NavStyle;
   navPosition: NavPosition;
   fontFamily: FontFamily;
   fontSize: FontSize;

   // ── Actions — panels ──────────────────────────────────────
   toggleQueue: () => void;
   toggleLyrics: () => void;
   toggleFullscreen: () => void;
   toggleDownloads: () => void;
   toggleSidebar: () => void;
   openDownloadModal: (trackId: string) => void;
   closeDownloadModal: () => void;
   closeAll: () => void;

   // ── Actions — layout ──────────────────────────────────────
   setNavStyle: (v: NavStyle) => void;
   setNavPosition: (v: NavPosition) => void;
   setFontFamily: (v: FontFamily) => void;
   setFontSize: (v: FontSize) => void;
}

export const useUIStore = create<UIStore>()(
   persist(
      set => ({
         showQueue: false,
         showLyrics: false,
         showFullscreen: false,
         showDownloads: false,
         sidebarCollapsed: false,
         downloadModalTrackId: null,

         navStyle: "pill",
         navPosition: "bottom",
         fontFamily: "plus-jakarta",
         fontSize: "default",

         // Queue and lyrics are mutually exclusive
         toggleQueue: () =>
            set(s => ({ showQueue: !s.showQueue, showLyrics: false })),
         toggleLyrics: () =>
            set(s => ({ showLyrics: !s.showLyrics, showQueue: false })),
         toggleFullscreen: () =>
            set(s => ({ showFullscreen: !s.showFullscreen })),
         toggleDownloads: () => set(s => ({ showDownloads: !s.showDownloads })),
         toggleSidebar: () =>
            set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),

         openDownloadModal: trackId => set({ downloadModalTrackId: trackId }),
         closeDownloadModal: () => set({ downloadModalTrackId: null }),

         closeAll: () =>
            set({
               showQueue: false,
               showLyrics: false,
               showFullscreen: false,
               showDownloads: false,
               downloadModalTrackId: null
            }),

         setNavStyle: v => set({ navStyle: v }),
         setNavPosition: v => set({ navPosition: v }),

         setFontFamily: v => {
            set({ fontFamily: v });
            const map: Record<FontFamily, string> = {
               "plus-jakarta": '"Plus Jakarta Sans", sans-serif',
               inter: '"Inter", sans-serif',
               system:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
            };
            document.documentElement.style.setProperty("--font-body", map[v]);
         },

         setFontSize: v => {
            set({ fontSize: v });
            const map: Record<FontSize, string> = {
               small: "14px",
               default: "16px",
               large: "18px"
            };
            document.documentElement.style.setProperty(
               "--font-size-base",
               map[v]
            );
         }
      }),
      {
         name: "shulker-ui",
         partialize: s => ({
            sidebarCollapsed: s.sidebarCollapsed,
            navStyle: s.navStyle,
            navPosition: s.navPosition,
            fontFamily: s.fontFamily,
            fontSize: s.fontSize
         })
      }
   )
);
