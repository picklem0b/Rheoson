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
	Event,
	RepeatMode as PlayerRepeatMode,
	State,
	type Track as PlayerTrack
} from 'react-native-track-player';

import { API_ORIGIN } from '@/constants/config';
import { cachedAudioUri } from '@/lib/audioCache';
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

/** The source the engine should load: the saved file first, the stream second. */
async function sourceFor(trackId: string): Promise<string> {
	const local = await cachedAudioUri(trackId);
	return local ?? streamUrlFor(trackId);
}

function toPlayerTrack(track: Track, url: string): PlayerTrack {
	return {
		id: track.id,
		url,
		title: track.title ?? 'Unknown title',
		artist: track.artist?.name ?? 'Unknown artist',
		album: track.album?.title ?? undefined,
		artwork: artworkUrlFor(track.id),
		duration: typeof track.duration === 'number' ? track.duration : undefined
	};
}

function toRepeatMode(mode: RepeatMode): PlayerRepeatMode {
	if (mode === 'one') return PlayerRepeatMode.Track;
	// 'all' is a queue repeat, not a track repeat. Mapping it to Off meant the
	// third state in the repeat control did nothing at all.
	if (mode === 'all') return PlayerRepeatMode.Queue;
	return PlayerRepeatMode.Off;
}

/** Replace what is playing with this track, and start it. */
export async function loadTrack(track: Track, autoplay = true): Promise<void> {
	const ready = await setupPlayer();
	if (!ready) return;
	await TrackPlayer.reset();
	await TrackPlayer.add(toPlayerTrack(track, await sourceFor(track.id)));
	if (autoplay) await TrackPlayer.play();
}

/**
 * Load a track without starting it, at a position.
 *
 * This is how a cold start resumes: the engine holds the last track and the
 * scrubber sits where the user left it, but audio waits for a gesture — a phone
 * that starts playing by itself on launch is both surprising and, on Android,
 * blocked anyway.
 */
export async function restoreTrack(track: Track, position: number): Promise<void> {
	const ready = await setupPlayer();
	if (!ready) return;
	try {
		await TrackPlayer.reset();
		await TrackPlayer.add(toPlayerTrack(track, await sourceFor(track.id)));
		if (position > 0) await TrackPlayer.seekTo(position);
	} catch {
		// A failed restore leaves the player empty, which the UI already
		// handles: the user taps the track again.
	}
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
		if (tracks.length > 0) {
			const prepared = await Promise.all(
				tracks.slice(0, 40).map(async track => toPlayerTrack(track, await sourceFor(track.id)))
			);
			await TrackPlayer.add(prepared);
		}
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
		const [progress, playback] = await Promise.all([
			TrackPlayer.getProgress(),
			TrackPlayer.getPlaybackState()
		]);
		return {
			position: Number.isFinite(progress.position) ? progress.position : 0,
			duration: Number.isFinite(progress.duration) ? progress.duration : 0,
			// The engine's own state enum, not a string: comparing to 'playing'
			// silently never matched, so the UI reported "paused" while audio was
			// coming out of the speaker.
			playing: playback.state === State.Playing
		};
	} catch {
		return { position: 0, duration: 0, playing: false };
	}
}

/** The id of whatever the engine is actually playing right now, if anything. */
export async function activeTrackId(): Promise<string | null> {
	try {
		const active = await TrackPlayer.getActiveTrack();
		return active?.id != null ? String(active.id) : null;
	} catch {
		return null;
	}
}

/**
 * The playback service.
 *
 * Registered once from the app entry (`index.js`). It is the only code that
 * runs while the app is backgrounded, and its job is to translate remote
 * control — notification buttons, headset taps, Android Auto — into player
 * calls. The native side can play and pause by itself, but next/previous and
 * seek have to be told what to do, and a notification whose buttons do nothing
 * is worse than one with no buttons.
 *
 * The session read is deliberate: this module is loaded before React exists, and
 * touching the keychain here means a resumed queue can still authenticate its
 * stream URLs.
 */
export async function playbackService(): Promise<void> {
	const { getSession: readSession } = await import('@/services/session');
	await readSession();

	TrackPlayer.addEventListener(Event.RemotePlay, () => void TrackPlayer.play());
	TrackPlayer.addEventListener(Event.RemotePause, () => void TrackPlayer.pause());
	TrackPlayer.addEventListener(Event.RemoteNext, () => void TrackPlayer.skipToNext().catch(() => undefined));
	TrackPlayer.addEventListener(Event.RemotePrevious, () =>
		void TrackPlayer.skipToPrevious().catch(() => undefined)
	);
	TrackPlayer.addEventListener(Event.RemoteSeek, event => void TrackPlayer.seekTo(event.position));
	TrackPlayer.addEventListener(Event.RemoteStop, () => void TrackPlayer.stop());
}
