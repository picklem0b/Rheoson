import { io, Socket } from 'socket.io-client'
import { WS_URL } from './constants'

type EventCallback = (data: unknown) => void

class WebSocketClient {
  private socket: Socket | null = null
  private listeners: Map<string, Set<EventCallback>> = new Map()

  connect() {
    if (this.socket?.connected) return

    this.socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    this.socket.on('connect', () => {
      console.log('[WS] Connected')
    })

    this.socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason)
    })

    this.socket.on('connect_error', (err) => {
      console.error('[WS] Connection error:', err.message)
    })

    // Re-bind stored listeners
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((cb) => this.socket?.on(event, cb))
    })
  }

  disconnect() {
    this.socket?.disconnect()
    this.socket = null
  }

  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
    this.socket?.on(event, callback)
  }

  off(event: string, callback: EventCallback) {
    this.listeners.get(event)?.delete(callback)
    this.socket?.off(event, callback)
  }

  emit(event: string, data?: unknown) {
    this.socket?.emit(event, data)
  }

  get connected() {
    return this.socket?.connected ?? false
  }
}

export const ws = new WebSocketClient()