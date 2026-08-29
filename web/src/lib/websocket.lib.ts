import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { WS_URL } from "@/lib/constants";

// ── Singleton socket ──────────────────────────────────────────
// One Socket.IO connection shared across the entire app.
// io() takes the SERVER ORIGIN — not the /api path.
// Using API_BASE here was the root cause of the WebSocket failure
// on the APK and on prod (it was passing the /api string as the host).

let _socket: Socket | null = null;
let _refCount: number = 0;

function _getSocket(): Socket {
   if (!_socket) {
      _socket = io(WS_URL, {
         path: "/socket.io",
         transports: ["websocket", "polling"],
         reconnectionAttempts: 10,
         reconnectionDelay: 1_000,
         reconnectionDelayMax: 10_000,
         timeout: 10_000,
         autoConnect: true
      });

      _socket.on("connect", () =>
         console.debug("[Shulker WS] connected", _socket?.id)
      );
      _socket.on("disconnect", r =>
         console.debug("[Shulker WS] disconnected", r)
      );
      _socket.on("connect_error", e =>
         console.warn("[Shulker WS] error", e.message)
      );
      _socket.on("reconnect", n =>
         console.debug("[Shulker WS] reconnected after", n, "attempts")
      );
      _socket.on("reconnect_failed", () =>
         console.error("[Shulker WS] gave up reconnecting")
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
// Map<event, Set<handler>> — each event+handler pair registered exactly once.
// Prevents doubled event firing on re-render without unmount.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => void
const _registry = new Map<string, Set<Handler>>();

function _addListener(event: string, handler: Handler): void {
   const socket = _getSocket();
   if (!_registry.has(event)) _registry.set(event, new Set());
   const handlers = _registry.get(event)!;
   if (handlers.has(handler)) return;

   if (handlers.size === 0) {
      socket.on(event, (...args: unknown[]) => {
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

// ── Public imperative API ─────────────────────────────────────

export const ws = {
   connect() {
      _getSocket().connect();
   },
   disconnect() {
      _socket?.disconnect();
   },
   on(event: string, h: Handler) {
      _addListener(event, h);
   },
   off(event: string, h: Handler) {
      _removeListener(event, h);
   },
   emit(event: string, data?: unknown) {
      _getSocket().emit(event, data);
   },
   get connected() {
      return _socket?.connected ?? false;
   }
};

// ── React hook ────────────────────────────────────────────────

interface UseWebSocketOptions {
   onConnect?: () => void;
   onDisconnect?: (reason: string) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
   const optRef = useRef(options);
   useEffect(() => {
      optRef.current = options;
   });

   useEffect(() => {
      _refCount++;
      const socket = _getSocket();
      const onConn = () => optRef.current.onConnect?.();
      const onDisconn = (r: string) => optRef.current.onDisconnect?.(r);
      socket.on("connect", onConn);
      socket.on("disconnect", onDisconn);
      return () => {
         socket.off("connect", onConn);
         socket.off("disconnect", onDisconn);
         _releaseSocket();
      };
   }, []);

   const on = useCallback((e: string, h: Handler) => _addListener(e, h), []);
   const off = useCallback(
      (e: string, h: Handler) => _removeListener(e, h),
      []
   );
   const emit = useCallback(
      (e: string, d?: unknown) => _getSocket().emit(e, d),
      []
   );
   const isConnected = useCallback(() => _socket?.connected ?? false, []);

   return { on, off, emit, isConnected };
}

// ── Download events hook ──────────────────────────────────────

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
   const hRef = useRef(handlers);
   useEffect(() => {
      hRef.current = handlers;
   });

   useEffect(() => {
      const progress = (e: DownloadProgressEvent) =>
         hRef.current.onProgress?.(e);
      const done = (e: DownloadProgressEvent) => hRef.current.onDone?.(e);
      const error = (e: DownloadProgressEvent) => hRef.current.onError?.(e);
      on("download:progress", progress);
      on("download:done", done);
      on("download:error", error);
      return () => {
         off("download:progress", progress);
         off("download:done", done);
         off("download:error", error);
      };
   }, [on, off]);
}
