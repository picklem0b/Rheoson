/**
 * The live channel: download progress, presence and queue events.
 *
 * Socket.IO rather than polling because a download that is at 12% should say
 * so continuously, and because a phone that reconnects on the bus should not
 * have to re-ask the server for everything — the socket replays what changed
 * while it was away.
 *
 * One connection for the whole app, created on first use and kept for the
 * session. The handshake carries the same guest token the REST client uses, so
 * the server can scope the channel to this device's own jobs.
 */
import { io, type Socket } from 'socket.io-client';

import { API_ORIGIN } from '@/constants/config';
import { ensureSession } from '@/services/session';

let socket: Socket | null = null;
let connecting: Promise<Socket | null> | null = null;

/** The live connection, connecting it if this is the first ask. */
export async function getSocket(): Promise<Socket | null> {
	if (socket?.connected) return socket;
	if (connecting) return connecting;

	connecting = (async () => {
		const token = await ensureSession();
		try {
			socket = io(API_ORIGIN, {
				transports: ['websocket'],
				auth: token ? { token } : {},
				reconnectionDelay: 1_000,
				reconnectionDelayMax: 10_000,
				autoConnect: true
			});
			return socket;
		} catch {
			// No socket is a degraded mode, not a failure: every screen that
			// uses it also has a REST fallback.
			return null;
		} finally {
			connecting = null;
		}
	})();

	return connecting;
}

/** Subscribe to one event; returns the unsubscribe function. */
export async function onEvent<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
	const connection = await getSocket();
	if (!connection) return () => undefined;

	const listener = (payload: T) => handler(payload);
	connection.on(event, listener);
	return () => connection.off(event, listener);
}

export function disconnect(): void {
	socket?.disconnect();
	socket = null;
}
