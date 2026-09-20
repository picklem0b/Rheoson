import { api } from './client.api'

/**
 * Health & diagnostics client.
 *
 * The backend exposes two depths that are reachable from the app:
 *
 *   GET /api/health       — cheap snapshot; dependency probes are refreshed
 *                           in the background every 60 s, so polling this is
 *                           free and safe for guests.
 *   GET /api/health/diag  — forces a fresh bounded probe of every subsystem.
 *                           Requires a session, because it runs real work.
 *
 * `/health/live` and `/health/ready` are deliberately not used here: they sit
 * outside `/api`, so the dev proxy and the prod API prefix both fail to reach
 * them from the SPA. The two endpoints above carry the same information.
 */

export type HealthStatus =
   | 'passing'
   | 'degraded'
   | 'failing'
   | 'skipped'
   | 'not_tested'

export interface BinaryProbe {
   present: boolean
   version: string | null
}

export interface HealthCheck {
   status: HealthStatus
   checkedAt: string
   detail?: string
   durationMs?: number
   /** storage */
   audioFiles?: number
   diskFreeBytes?: number
   diskTotalBytes?: number
   /** mongodb */
   latencyMs?: number
   /** binaries */
   binaries?: {
      ytdlp: BinaryProbe
      ffmpeg: BinaryProbe
   }
   /** config */
   env?: string
}

export interface LatencySnapshot {
   uptimeS: number
   totalRequests: number
   window60s: {
      requests: number
      byStatus: Record<string, number>
      latencyMs: { p50?: number; p95?: number; p99?: number }
   }
   recentErrors: { status?: number; path?: string; at?: string }[]
}

export interface HealthPayload {
   schemaVersion: string
   service: string
   generatedAt: string
   requestId?: string | null
   uptimeS: number
   status: HealthStatus
   checks: Record<string, HealthCheck>
   summary: Partial<Record<HealthStatus, number>>
   latency?: LatencySnapshot
   diagnostics?: { forceRefreshedAt: string }
}

export interface SelftestCheck {
   name: string
   description: string
   status: 'pass' | 'warn' | 'fail' | 'skipped'
   latencyMs?: number
   detail?: string
}

export interface SelftestPayload {
   schemaVersion: number
   status: SelftestCheck['status']
   totalMs: number
   checks: SelftestCheck[]
   summary: { pass: number; warn: number; fail: number; skipped: number }
}

export const healthApi = {
   /** Cheap, unauthenticated snapshot. */
   snapshot: () => api.get<HealthPayload>('/health'),

   /** Fresh deep probe. Requires a session. */
   deep: () => api.get<HealthPayload>('/health/diag'),

   /** Path-level self-test: drives real read-only requests through the
    *  backend's own stack. Requires a session (runs live upstream calls). */
   selftest: () => api.get<SelftestPayload>('/health/selftest'),
}

export const { snapshot: healthSnapshot, deep: healthDeep } = healthApi
