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
 * Ordering contract (this is what prevents a stale device from clobbering
 * newer server state):
 * 1. On sign-in the server copy is pulled and applied — server wins.
 * 2. Only AFTER a successful pull does pushing start. If the pull fails,
 *    the hook keeps retrying the pull and never pushes, so a device that
 *    just came online cannot overwrite the account with stale values —
 *    it converges on the server's state first.
 * 3. While pulled, only keys whose local value actually changed since the
 *    last sync are pushed (diff, not dump).
 *
 * Signed-out devices are untouched: local-first stays true for people who
 * never make an account.
 */

/** Keys synced to the account. Keep in lockstep with the server whitelist
 * (api/app/services/preferences.py DEFAULTS) and the sections' usePersisted keys. */
export const SYNC_KEYS = [
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

type SyncKey = (typeof SYNC_KEYS)[number];

/** Theme/nav live in Zustand persist blobs, not rheoson-* keys; read them
 * from the stores so both surfaces flow through the same sync path. */
function readKeyValue(key: SyncKey): string | number | boolean | undefined {
   switch (key) {
      case "theme-accent":
         return useThemeStore.getState().theme.accent;
      case "theme-surface":
         return useThemeStore.getState().theme.surface;
      case "glass-opacity":
         return useThemeStore.getState().glassOpacity;
      case "nav-style":
         return useUIStore.getState().navStyle;
      case "nav-position":
         return useUIStore.getState().navPosition;
      default:
         try {
            const raw = localStorage.getItem(`rheoson-${key}`);
            return raw !== null ? JSON.parse(raw) : undefined;
         } catch {
            return undefined;
         }
   }
}

/** Apply one server value to its owning surface. */
function applyServerValue(key: string, value: unknown): void {
   switch (key) {
      case "theme-accent":
         if (
            typeof value === "string" &&
            value !== useThemeStore.getState().theme.accent
         ) {
            useThemeStore.getState().setAccent(value as never);
         }
         return;
      case "theme-surface":
         if (
            typeof value === "string" &&
            value !== useThemeStore.getState().theme.surface
         ) {
            useThemeStore.getState().setSurface(value as never);
         }
         return;
      case "glass-opacity":
         if (
            typeof value === "number" &&
            value !== useThemeStore.getState().glassOpacity
         ) {
            useThemeStore.getState().setGlassOpacity(value);
         }
         return;
      case "nav-style":
         if (
            typeof value === "string" &&
            value !== useUIStore.getState().navStyle
         ) {
            useUIStore.getState().setNavStyle(value as never);
         }
         return;
      case "nav-position":
         if (
            typeof value === "string" &&
            value !== useUIStore.getState().navPosition
         ) {
            useUIStore.getState().setNavPosition(value as never);
         }
         return;
      default:
         localStorage.setItem(`rheoson-${key}`, JSON.stringify(value));
   }
}

/** Collect locally-changed keys since `baseline` as a patch ({} if none). */
export function diffAgainstBaseline(
   baseline: PreferenceValues
): PreferenceValues {
   const patch: PreferenceValues = {};
   for (const key of SYNC_KEYS) {
      const v = readKeyValue(key);
      if (v !== undefined && v !== baseline[key]) {
         patch[key] = v;
      }
   }
   return patch;
}

export function usePreferenceSync() {
   const token = useAuthStore(s => s.token);
   const ready = useAuthStore(s => s.ready);

   const signedIn = Boolean(token && ready);
   const baseline = useRef<PreferenceValues | null>(null);
   const lastPush = useRef<number>(0);

   useEffect(() => {
      if (!signedIn) {
         baseline.current = null;
         return;
      }

      let cancelled = false;

      const pull = async () => {
         try {
            const { preferences: server } = await preferencesApi.get();
            if (cancelled) return false;
            for (const [key, value] of Object.entries(server)) {
               applyServerValue(key, value);
            }
            applyFromStorage();
            baseline.current = { ...server };
            return true;
         } catch {
            // Server unreachable — retry on the next tick. Pushing stays
            // disabled until one pull succeeds, so a stale device can
            // never overwrite newer account state.
            return false;
         }
      };

      // Initial pull immediately; the interval keeps it alive.
      void pull();

      const timer = window.setInterval(async () => {
         if (cancelled || document.hidden) return;
         const now = Date.now();

         if (baseline.current === null) {
            // Not yet converged with the server — keep trying to pull.
            await pull();
            return;
         }

         if (now - lastPush.current < 4000) return;
         const patch = diffAgainstBaseline(baseline.current);
         if (Object.keys(patch).length === 0) return;

         // Optimistically advance the baseline to the pushed values; a
         // failure is retried because the next diff will still see the
         // local values differing from what the server acknowledged...
         // except it won't — so on failure, roll the baseline back.
         const rollback = { ...baseline.current };
         for (const k of Object.keys(patch)) {
            baseline.current[k] = patch[k];
         }
         lastPush.current = now;
         try {
            await preferencesApi.put(patch);
         } catch {
            if (!cancelled) baseline.current = rollback;
         }
      }, 1500);

      return () => {
         cancelled = true;
         window.clearInterval(timer);
      };
   }, [signedIn]);

   return null;
}
