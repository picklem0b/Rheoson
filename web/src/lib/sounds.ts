/**
 * Central sound-effects manager.
 *
 * All UI chimes (success toasts, download-complete) route through here so
 * Settings → Notifications actually controls them. Playback is gated on the
 * persisted "notif-sound" preference; download-complete additionally honours
 * "notif-dl-done".
 *
 * Preferences are read at play time (cheap localStorage read), so a toggle
 * change in Settings takes effect immediately — no reload or subscription
 * needed.
 */

const _chime =
   typeof window !== "undefined"
      ? Object.assign(new Audio("/assets/rhea.mp3"), { preload: "auto" as const })
      : null;

function readPref(key: string, fallback: boolean): boolean {
   try {
      const raw = localStorage.getItem(`rheoson-${key}`);
      return raw !== null ? JSON.parse(raw) === true : fallback;
   } catch {
      return fallback;
   }
}

/** Master switch — Settings → Notifications → "Sound effects". */
export function soundEffectsEnabled(): boolean {
   return readPref("notif-sound", true);
}

/** Download-complete chime — additionally gated by "Download complete". */
export function downloadChimeEnabled(): boolean {
   return readPref("notif-dl-done", true);
}

/**
 * Play the UI chime. No-op when sound effects are disabled (or audio can't
 * start — e.g. autoplay policy), which is fine.
 *
 * @param volume 0..1 — louder for download completion, subtle for feedback.
 * @param force  Play regardless of the "notif-sound" pref (used when previewing
 *               the sound from Settings itself).
 */
export function playChime(volume = 0.35, force = false): void {
   if (!force && !soundEffectsEnabled()) return;
   if (!_chime) return;
   _chime.currentTime = 0;
   _chime.volume = volume;
   _chime.play().catch(() => {});
}
