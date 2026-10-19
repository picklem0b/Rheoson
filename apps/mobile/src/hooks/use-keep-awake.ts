import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { usePlayerStore } from '@/store/player.store';
import { useSettingsStore } from '@/store/settings.store';

const TAG = 'rheoson-playback';

/**
 * Holds the screen on while music is playing, and only then.
 *
 * A phone in a pocket does not need its display lit; a phone on a desk with the
 * lyrics open does. Tying the wake lock to `isPlaying` — rather than to "the app
 * is open" — means the setting costs battery only while it is earning its keep,
 * and the tag makes the release target the lock this hook took rather than any
 * other module's.
 */
export function useKeepAwakeWhilePlaying(): void {
	const enabled = useSettingsStore(state => state.keepAwake);
	const isPlaying = usePlayerStore(state => state.isPlaying);

	useEffect(() => {
		if (!enabled || !isPlaying) return undefined;

		void activateKeepAwakeAsync(TAG).catch(() => undefined);
		return () => {
			void deactivateKeepAwake(TAG).catch(() => undefined);
		};
	}, [enabled, isPlaying]);
}
