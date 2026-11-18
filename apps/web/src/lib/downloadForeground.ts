/**
 * JS bridge to the Android download foreground service.
 *
 * Why this exists: downloads run in the backend (yt-dlp), but the OS was
 * free to freeze the whole app — WebView included — the moment the user
 * locked the screen or switched apps, silently killing in-flight
 * transfers. Holding a foreground-service slot for the duration keeps the
 * process alive; the persistent notification is the OS's price for that.
 *
 * Platform behaviour:
 * - Android (APK with the plugin registered): start/stop/update hit the
 *   native service. The first start also requests POST_NOTIFICATIONS on
 *   Android 13+ if it wasn't granted yet.
 * - Web / dev / older APKs without the plugin: no-ops. Every call is safe
 *   to make unconditionally from download lifecycle code.
 *
 * Usage contract (enforced in useDownloadSocket wiring):
 *   job starts   → notifyStarted(title, activeCount)
 *   job ends     → notifyStopped() ONLY when no other jobs are active
 */
import { Capacitor } from "@capacitor/core";

type DownloadForegroundPlugin = {
   start(options: { title?: string; count?: number }): Promise<{
      started: boolean;
      notificationVisible?: boolean;
   }>;
   stop(): Promise<{ started: boolean }>;
   update(options: { title?: string; count?: number }): Promise<void>;
   isAvailable(): Promise<{ available: boolean }>;
};

function getPlugin(): DownloadForegroundPlugin | null {
   if (Capacitor.getPlatform() !== "android") return null;
   const p = (Capacitor as unknown as {
      Plugins?: Record<string, DownloadForegroundPlugin | undefined>;
   }).Plugins;
   return p?.DownloadForeground ?? null;
}

/** Android 13+ notification permission, requested on first download.
 * Uses Capacitor's native-bridge API directly — no plugin dependency.
 * The native plugin also covers this (it starts the service regardless),
 * so a refusal here only means a hidden notification, never a lost job. */
async function ensureNotificationPermission(): Promise<boolean> {
   try {
      const cap = Capacitor as unknown as {
         nativePromise?: (
            plugin: string,
            method: string,
            options?: Record<string, unknown>
         ) => Promise<Record<string, string>>;
      };
      if (!cap.nativePromise) return false;
      const cur = await cap.nativePromise("LocalNotifications", "checkPermissions");
      if (cur.display === "granted") return true;
      const req = await cap.nativePromise("LocalNotifications", "requestPermissions");
      return req.display === "granted";
   } catch {
      return false;
   }
}

let active = false;

export const downloadForeground = {
   /** Show the persistent "downloading" notification. */
   async start(title?: string, count = 1): Promise<void> {
      const plugin = getPlugin();
      if (!plugin) return;
      try {
         await ensureNotificationPermission();
         await plugin.start({ title, count: Math.max(1, count) });
         active = true;
      } catch {
         // Never let a notification failure break a download.
      }
   },

   /** Refresh the notification text (e.g. current top-of-queue title). */
   async update(title: string, count = 1): Promise<void> {
      const plugin = getPlugin();
      if (!plugin || !active) return;
      try {
         await plugin.update({ title, count: Math.max(1, count) });
      } catch {
         /* same contract as start */
      }
   },

   /** Remove the notification / release the foreground slot. */
   async stop(): Promise<void> {
      const plugin = getPlugin();
      if (!plugin) return;
      try {
         await plugin.stop();
      } catch {
         /* idempotent by design */
      } finally {
         active = false;
      }
   },

   /** True on an APK build whose native plugin is registered. */
   async isAvailable(): Promise<boolean> {
      const plugin = getPlugin();
      if (!plugin) return false;
      try {
         return (await plugin.isAvailable()).available;
      } catch {
         return false;
      }
   }
};
