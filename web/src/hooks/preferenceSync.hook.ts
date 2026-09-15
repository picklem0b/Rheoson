import { useEffect, useRef } from "react";
import { preferencesApi, type PreferenceValues } from "@/api/preferences.api";
import { useAuthStore } from "@/store/auth.store";
import { useThemeStore } from "@/store/theme.store";
import { useUIStore } from "@/store/ui.store";
import { applyFromStorage } from "@/lib/audioEffects";

/**
 * Pulls the account's synced preferences over the device's local values and
 * pushes local edits back up while signed in.
 *
 * Direction of truth:
 * - On sign-in the SERVER copy wins for whitelisted keys, so the same person
 *   lands in the same app everywhere they sign in. Keys the server copy
 *   doesn't mention are left as stored locally — device-only customisation
 *   survives instead of snapping to factory.
 * - While signed in, every whitelisted toggle is mirrored to the account as
 *   it changes, so a fresh device inherits it mid-session.
 * - Signed-out devices are untouched: local-first stays true for people who
 *   never make an account.
 */
export function usePreferenceSync() {
   const token = useAuthStore(s => s.token);
   const ready = useAuthStore(s => s.ready);
   const lastPushed = useRef<PreferenceValues>({});

   const signedIn = Boolean(token && ready);

   useEffect(() => {
      if (!signedIn) return;
      let cancelled = false;

      (async () => {
         try {
            const { preferences: server } = await preferencesApi.get();
            if (cancelled) return;

            // ── Server copy wins for whitelisted, known keys ──
            for (const [key, value] of Object.entries(server)) {
               localStorage.setItem(`rheoson-${key}`, JSON.stringify(value));
            }

            // Re-apply the store-backed surfaces immediately so the whole
            // UI reflects the synced values without a reload.
            const theme = useThemeStore.getState();
            const accent = server["theme-accent"];
            const surface = server["theme-surface"];
            const glass = server["glass-opacity"];
            if (typeof accent === "string" && accent !== theme.theme.accent) {
               theme.setAccent(accent as never);
            }
            if (
               typeof surface === "string" &&
               surface !== theme.theme.surface
            ) {
               theme.setSurface(surface as never);
            }
            if (typeof glass === "number" && glass !== theme.glassOpacity) {
               theme.setGlassOpacity(glass);
            }

            const ui = useUIStore.getState();
            const navStyle = server["nav-style"];
            const navPosition = server["nav-position"];
            if (
               typeof navStyle === "string" &&
               navStyle !== ui.navStyle
            ) {
               ui.setNavStyle(navStyle as never);
            }
            if (
               typeof navPosition === "string" &&
               navPosition !== ui.navPosition
            ) {
               ui.setNavPosition(navPosition as never);
            }

            applyFromStorage();

            lastPushed.current = { ...server };
         } catch {
            // Server copy unreachable — local values keep working untouched.
         }
      })();

      return () => {
         cancelled = true;
      };
   }, [signedIn]);

   // ── Push local edits up while signed in ──
   useEffect(() => {
      if (!signedIn) return;

      const KEYS = [
         "autoplay",
         "normalize",
         "bass-boost",
         "mono",
         "pre-amp-gain",
         "eq-preset",
         "notif-sound",
         "notif-dl-done",
         "save-history",
         "save-search-log",
         "theme-accent",
         "theme-surface",
         "glass-opacity",
         "nav-style",
         "nav-position"
      ] as const;

      // Theme/nav live in Zustand persist blobs, not rheoson-* keys; read
      // them from the stores so both surfaces push through the same path.
      const readKey = (key: (typeof KEYS)[number]): unknown => {
         if (key === "theme-accent")
            return useThemeStore.getState().theme.accent;
         if (key === "theme-surface")
            return useThemeStore.getState().theme.surface;
         if (key === "glass-opacity")
            return useThemeStore.getState().glassOpacity;
         if (key === "nav-style") return useUIStore.getState().navStyle;
         if (key === "nav-position") return useUIStore.getState().navPosition;
         try {
            const raw = localStorage.getItem(`rheoson-${key}`);
            return raw !== null ? JSON.parse(raw) : undefined;
         } catch {
            return undefined;
         }
      };

      const timer = window.setInterval(() => {
         if (document.hidden) return;
         const patch: PreferenceValues = {};

         for (const key of KEYS) {
            const v = readKey(key);
            if (
               v !== undefined &&
               v !== lastPushed.current[key]
            ) {
               patch[key] = v as string | number | boolean;
               lastPushed.current[key] = v as string | number | boolean;
            }
         }

         if (Object.keys(patch).length > 0) {
            preferencesApi.put(patch).catch(() => {
               /* offline or signed out mid-flight — retried next tick */
            });
         }
      }, 4000);

      return () => window.clearInterval(timer);
   }, [signedIn]);

   return null;
}
