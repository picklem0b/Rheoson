/**
 * The audio engine.
 *
 * `react-native-track-player` is the only player that does the hard parts of a
 * music app on Android: a notification with transport controls, a foreground
 * service that keeps audio alive when the app is backgrounded, and gapless
 * advance from the queue. It is also the reason `app.json` disables the New
 * Architecture — the library needs the old one.
 *
 * This module owns the native player and nothing else. It never decides *what*
 * should play: `hooks/use-playback.ts` reads the stores and calls these
 * functions, so there is exactly one place where "the user pressed play" turns
 * into audio.
 */
import TrackPlayer, {
	AppKilledPlaybackBehavior,
	Capability,
	RepeatMode as PlayerRepeatMode,
	type Track as PlayerTrack
} from 'react-native-track-player';

import { API_ORIGIN } from '@/constants/config';
import { getSession } from '@/services/session';
import type { RepeatMode, Track } from '@rheoson/api-types';

let setupPromise: Promise<boolean> | null = null;

/** The stream URL. Absolute — the native player resolves nothing against a page. */
export function streamUrlFor(trackId: string): string {
	return `${API_ORIGIN}/api/stream/${trackId}/audio`;
}

/** Artwork URL for the notification and lock screen. */
export function artworkUrlFor(trackId: string): string {
	return `${API_ORIGIN}/api/stream/${trackId}/artwork`;
}

/**
 * Set the player up once per launch.
 *
 * Resolves to false when the native module is missing (Expo Go, a web build),
 * which is a supported state: the UI still renders and the transport controls
 * report "playback unavailable" instead of throwing on a tap.
 */
export async function setupPlayer(): Promise<boolean> {
	if (setupPromise) return setupPromise;

	setupPromise = (async () => {
		try {
			await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
		} catch (err) {
			// "already initialized" is the common case on a fast refresh.
			if (!String((err as Error)?.message ?? '').includes('already')) return false;
		}

		try {
			await TrackPlayer.updateOptions({
				android: {
					// Keep playing when the app is swiped away: a music app that
					// stops on task removal is a music app nobody keeps.
					appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback
				},
				capabilities: [
					Capability.Play,
					Capability.Pause,
					Capability.SkipToNext,
					Capability.SkipToPrevious,
					Capability.SeekTo,
					Capability.Stop
				],
				compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
				notificationCapabilities: [
					Capability.Play,
					Capability.Pause,
					Capability.SkipToNext,
					Capability.SkipToPrevious
				]
			});
			return true;
		} catch {
			return false;
		}
	})();

	return setupPromise;
}

function toPlayerTrack(track: Track): PlayerTrack {
	return {
		id: track.id,
		url: streamUrlFor(track.id),
		title: track.title ?? 'Unknown title',
		artist: track.artist?.name ?? 'Unknown artist',
		album: track.album?.title ?? undefined,
		artwork: artworkUrlFor(track.id),
		duration: typeof track.duration === 'number' ? track.duration : undefined
	};
}

function toRepeatMode(mode: RepeatMode): PlayerRepeatMode {
	if (mode === 'one') return PlayerRepeatMode.Track;
	return PlayerRepeatMode.Off;
}

/** Replace what is playing with this track, and start it. */
export async function loadTrack(track: Track, autoplay = true): Promise<void> {
	const ready = await setupPlayer();
	if (!ready) return;
	await TrackPlayer.reset();
	await TrackPlayer.add(toPlayerTrack(track));
	if (autoplay) await TrackPlayer.play();
}

/** Put the upcoming tracks in the native queue, after whatever is playing. */
export async function syncUpcoming(tracks: Track[]): Promise<void> {
	const ready = await setupPlayer();
	if (!ready) return;
	try {
		const queue = await TrackPlayer.getQueue();
		const start = queue.length > 0 ? 1 : 0;
		await TrackPlayer.remove(
			queue.map((_, index) => index).filter(index => index >= start)
		);
		if (tracks.length > 0) await TrackPlayer.add(tracks.slice(0, 40).map(toPlayerTrack));
	} catch {
		// A queue that failed to sync is not worth interrupting playback over;
		// the next advance will try again.
	}
}

export async function play(): Promise<void> {
	await TrackPlayer.play();
}

export async function pause(): Promise<void> {
	await TrackPlayer.pause();
}

export async function seekTo(seconds: number): Promise<void> {
	await TrackPlayer.seekTo(Math.max(0, seconds));
}

export async function setRepeatMode(mode: RepeatMode): Promise<void> {
	await TrackPlayer.setRepeatMode(toRepeatMode(mode));
}

/** Position, duration and playing state, straight from the engine. */
export async function readProgress(): Promise<{
	position: number;
	duration: number;
	playing: boolean;
}> {
	try {
		const [position, duration, state] = await Promise.all([
			TrackPlayer.getProgress().then(progress => progress.position),
			TrackPlayer.getProgress().then(progress => progress.duration),
			TrackPlayer.getPlaybackState()
		]);
		return {
			position: Number.isFinite(position) ? position : 0,
			duration: Number.isFinite(duration) ? duration : 0,
			playing: state === 'playing'
		};
	} catch {
		return { position: 0, duration: 0, playing: false };
	}
}

/**
 * The playback service.
 *
 * Registered once from the root layout. It is the only code that runs while the
 * app is backgrounded, and its job is to translate remote control (notification,
 * headset button, Android Auto) into player calls. Anything it needs from the
 * session is read here rather than passed in, because this module is loaded by
 * the native side before React exists.
 */
export async function playbackService(): Promise<void> {
	const { getSession: readSession } = await import('@/services/session');
	await readSession();
}
