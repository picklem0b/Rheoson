/**
 * Haptic feedback, with one rule: only the transport is allowed to buzz.
 *
 * Vibration that fires on scrolling, on every list row, or on a screen opening
 * stops reading as feedback and starts reading as a malfunction. So this is
 * called from playback controls — play/pause, skip, like, queue actions — and
 * honours the Settings toggle instead of ignoring it.
 */
import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '@/store/settings.store';

type HapticKind = 'light' | 'medium' | 'success' | 'warning';

export async function haptic(kind: HapticKind = 'light'): Promise<void> {
	if (!useSettingsStore.getState().haptics) return;
	try {
		if (kind === 'success') {
			await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
			return;
		}
		if (kind === 'warning') {
			await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
			return;
		}
		await Haptics.impactAsync(
			kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
		);
	} catch {
		// Haptics are unavailable on emulators and can be disabled system-wide;
		// neither is a reason to interrupt what the user just did.
	}
}
