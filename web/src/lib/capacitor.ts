/**
 * Capacitor platform detection.
 *
 * Safe to import in any environment — returns false in browser/web.
 * Used by localFs.ts, keepAwake.ts, statusbar.ts, etc.
 */

import { Capacitor } from '@capacitor/core';

/** True when running inside a native Capacitor shell (Android/iOS). */
export function isNativePlatform(): boolean {
   try {
      return Capacitor.isNativePlatform();
   } catch {
      return false;
   }
}

/** True when running on Android specifically. */
export function isAndroid(): boolean {
   try {
      return Capacitor.getPlatform() === 'android';
   } catch {
      return false;
   }
}

/** True when running on iOS. */
export function isIos(): boolean {
   try {
      return Capacitor.getPlatform() === 'ios';
   } catch {
      return false;
   }
}
