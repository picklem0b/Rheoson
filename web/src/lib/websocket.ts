import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE } from '@/lib/constants';

// ── Singleton socket ──────────────────────────────────────────
// One Socket.IO connection shared across the entire app.
// Components that call useWebSocket() all read/write the same socket —
// they do not open additional connections.

let _socket: Socket | null = null;
let _refCount = 0;

function _getSocket(): Socket {
    if (!_socket) {
        _socket = io(API_BASE, {
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
            reconnectionDelay: 1_000,
            reconnectionDelayMax: 10_000,
            timeout: 10_000,
            autoConnect: true
        });

        _socket.on('connect', () =>
            console.debug('[Shulker WS] connected', _socket?.id)
        );
        _socket.on('disconnect', r =>
            console.debug('[Shulker WS] disconnected', r)
        );
        _socket.on('connect_error', e =>
            console.warn('[Shulker WS] error', e.message)
        );
        _socket.on('reconnect', n =>
            console.debug('[Shulker WS] reconnected after', n, 'attempts')
        );
        _socket.on('reconnect_failed', () =>
            console.error('[Shulker WS] gave up reconnecting')
        );
    }
    return _socket;
}

function _releaseSocket() {
    _refCount--;
    if (_refCount <= 0 && _socket) {
        _socket.disconnect();
        _socket = null;
        _refCount = 0;
    }
}

// ── Listener registry ─────────────────────────────────────────
// FIX: previously listeners were pushed into an array with no deduplication
// guard. If a React component using useWebSocket() re-rendered without
// unmounting (e.g. a parent state change), it would call socket.on() again
// for the same event+handler pair, resulting in doubled event firing over
// repeated renders.
//
// The registry is: Map<event, Set<handler>>. Each event+handler pair is only
// registered once with the underlying socket. When the last handler for an
// event is removed, the socket.off() call is made.

type Handler = (...args: any[]) => void;
const _registry = new Map<string, Set<Handler>>();

function _addListener(event: string, handler: Handler): void {
    const socket = _getSocket();
    if (!_registry.has(event)) {
        _registry.set(event, new Set());
    }
    const handlers = _registry.get(event)!;
    if (handlers.has(handler)) return; // already registered — no duplicate

    // If this is the first handler for this event, bind the socket listener
    // that fans out to all registered handlers.
    if (handlers.size === 0) {
        socket.on(event, (...args: any[]) => {
            _registry.get(event)?.forEach(h => h(...args));
        });
    }
    handlers.add(handler);
}

function _removeListener(event: string, handler: Handler): void {
    const handlers = _registry.get(event);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) {
        _registry.delete(event);
        _socket?.off(event);
    }
}

// ── Hook ──────────────────────────────────────────────────────

interface UseWebSocketOptions {
    onConnect?: () => void;
    onDisconnect?: (reason: string) => void;
}
export const ws = {
    connect() {
        _getSocket().connect();
    },

    disconnect() {
        _socket?.disconnect();
    },

    on(event: string, handler: Handler) {
        _addListener(event, handler);
    },

    off(event: string, handler: Handler) {
        _removeListener(event, handler);
    },

    emit(event: string, data?: unknown) {
        _getSocket().emit(event, data);
    },

    get connected() {
        return _socket?.connected ?? false;
    }
};
export function useWebSocket(options: UseWebSocketOptions = {}) {
    const optionsRef = useRef(options);
    useEffect(() => {
        optionsRef.current = options;
    });

    // Increment ref count so the socket is not destroyed while this hook
    // is mounted somewhere.
    useEffect(() => {
        _refCount++;
        const socket = _getSocket();

        const onConnect = () => optionsRef.current.onConnect?.();
        const onDisconnect = (r: string) =>
            optionsRef.current.onDisconnect?.(r);

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            _releaseSocket();
        };
    }, []);

    const on = useCallback((event: string, handler: Handler) => {
        _addListener(event, handler);
    }, []);

    const off = useCallback((event: string, handler: Handler) => {
        _removeListener(event, handler);
    }, []);

    const emit = useCallback((event: string, data?: unknown) => {
        _getSocket().emit(event, data);
    }, []);

    const isConnected = useCallback(() => _socket?.connected ?? false, []);

    return { on, off, emit, isConnected };
}

// ── Convenience hook: download events ─────────────────────────

export interface DownloadProgressEvent {
    id: string;
    progress: number;
    status: string;
    title?: string;
    error?: string;
    filePath?: string;
}

export function useDownloadSocket(handlers: {
    onProgress?: (e: DownloadProgressEvent) => void;
    onDone?: (e: DownloadProgressEvent) => void;
    onError?: (e: DownloadProgressEvent) => void;
}) {
    const { on, off } = useWebSocket();
    const handlersRef = useRef(handlers);
    useEffect(() => {
        handlersRef.current = handlers;
    });

    useEffect(() => {
        const progress = (e: DownloadProgressEvent) =>
            handlersRef.current.onProgress?.(e);
        const done = (e: DownloadProgressEvent) =>
            handlersRef.current.onDone?.(e);
        const error = (e: DownloadProgressEvent) =>
            handlersRef.current.onError?.(e);

        on('download:progress', progress);
        on('download:done', done);
        on('download:error', error);

        return () => {
            off('download:progress', progress);
            off('download:done', done);
            off('download:error', error);
        };
    }, [on, off]);
}
