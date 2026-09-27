import { env } from '../env.js';
import { engineHealthy } from './engine.service.js';

/**
 * The ops surface — the server's own telemetry, for the admin console.
 *
 * Three pieces, each deliberately simple:
 *
 * * **A bounded log ring.** The last 500 structured entries, captured by a
 *   pino stream and read from memory. This is the "viewing logs" answer: no
 *   external log stack required, nothing unbounded, and in a multi-instance
 *   deployment each instance serves its own ring (which is the honest view).
 * * **Deep health.** `/health` answers liveness for orchestration; this
 *   answers *diagnosis* — Postgres, the engine, the relay, the bus, the
 *   posture — one row each, with what it means.
 * * **Smoke checks.** The two internal calls that must work for the app to
 *   be usable, executed live on demand.
 */

import { Writable } from 'node:stream';

export interface LogEntry {
  time: string;
  level: string;
  msg: string;
  /** Rest of the pino line, kept for the detail view. */
  rest?: Record<string, unknown>;
}

const RING_CAPACITY = 500;
const ring: LogEntry[] = [];

/** A pino destination that keeps the last N entries in memory.
 *
 * A plain Writable, deliberately — not a Transform. Nothing reads *from*
 * this stream, and a Transform stops invoking its transform once its
 * readable buffer passes the high-water mark with no reader attached. That
 * stall would make the console's log view silently freeze mid-stream.
 */
export const logTap = new Writable({
  objectMode: true,
  write(chunk, _encoding, callback) {
    try {
      const line = typeof chunk === 'string' ? JSON.parse(chunk) : chunk;
      if (line && typeof line === 'object' && 'msg' in line) {
        const { time, level, msg, ...rest } = line as Record<string, unknown>;
        ring.push({
          time: typeof time === 'number' ? new Date(time).toISOString() : String(time ?? ''),
          level: levelNumberToName(level),
          msg: String(msg ?? ''),
          rest: Object.keys(rest).length > 0 ? rest : undefined,
        });
        if (ring.length > RING_CAPACITY) ring.splice(0, ring.length - RING_CAPACITY);
      }
    } catch {
      // A non-JSON log line is still log output; keep it as one entry.
      ring.push({ time: new Date().toISOString(), level: 'info', msg: String(chunk).slice(0, 500) });
      if (ring.length > RING_CAPACITY) ring.splice(0, ring.length - RING_CAPACITY);
    }
    callback();
  },
});

function levelNumberToName(level: unknown): string {
  const table: Record<number, string> = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' };
  if (typeof level === 'number') return table[level] ?? String(level);
  return String(level ?? 'info');
}

export function recentLogs(count: number, level: string | undefined): LogEntry[] {
  const filtered = level ? ring.filter((entry) => entry.level === level) : ring;
  return filtered.slice(-Math.max(1, Math.min(count, RING_CAPACITY)));
}

export function logStats(): { capacity: number; held: number } {
  return { capacity: RING_CAPACITY, held: ring.length };
}

/** Test hook: the ring is process state by design, so tests reset it
 * explicitly (the same pattern as the old backend's `_reset_rate_limit`). */
export function _resetRing(): void {
  ring.length = 0;
}

// ── Deep health ───────────────────────────────────────────────

export interface HealthRow {
  name: string;
  ok: boolean;
  detail: string;
}

export async function deepHealth(): Promise<{ posture: string; ok: boolean; rows: HealthRow[] }> {
  const rows: HealthRow[] = [];

  // Postgres: a one-line query through the app's own pool.
  let postgresOk = false;
  try {
    const { db } = await import('../db/client.js');
    await db.execute('select 1' as never);
    postgresOk = true;
  } catch (error) {
    rows.push({ name: 'postgres', ok: false, detail: error instanceof Error ? error.message.slice(0, 160) : 'unreachable' });
  }
  if (postgresOk) rows.push({ name: 'postgres', ok: true, detail: 'accepting queries' });

  // Engine: the healthy() probe with a name that says what it is.
  const engine = await engineHealthy();
  rows.push({
    name: 'engine',
    ok: engine,
    detail: engine ? 'library, downloads and streaming available' : 'unreachable — library, downloads and streaming are down',
  });

  // Relay: optional by design, so "down" is a degraded mode, not an outage.
  try {
    const res = await fetch(`${env.RELAY_URL}/health`, { signal: AbortSignal.timeout(1500) });
    rows.push({ name: 'relay', ok: res.ok, detail: res.ok ? 'byte path available' : `answered ${res.status}` });
  } catch {
    rows.push({ name: 'relay', ok: false, detail: 'unreachable — streaming falls back to the server tier' });
  }

  // Bus: silently degrading infrastructure gets a loud row.
  const { busTransport } = await import('../realtime/bus.js');
  const transport = busTransport();
  rows.push({
    name: 'bus',
    ok: true,
    detail: transport === 'redis' ? 'redis fan-out across instances' : 'in-process fan-out — fine for one instance, silent otherwise',
  });

  return {
    posture: env.CLERK_SECRET_KEY ? 'production (Clerk)' : env.isDev ? 'development (dev auth stub)' : 'misconfigured',
    ok: rows.every((row) => row.ok || row.name === 'relay'),
    rows,
  };
}

// ── Smoke checks ──────────────────────────────────────────────

export interface SmokeResult {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export async function smokeTests(userId: string): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];

  // 1. The engine's library — the path behind every list in the app.
  const startedAt = Date.now();
  try {
    const res = await fetch(`${env.ENGINE_URL}/library/tracks?limit=1`, {
      headers: {
        Accept: 'application/json',
        ...(env.ENGINE_TOKEN ? { Authorization: `Bearer ${env.ENGINE_TOKEN}` } : {}),
        'X-Owner-Id': userId,
      },
      signal: AbortSignal.timeout(5000),
    });
    results.push({
      name: 'engine library read',
      ok: res.ok,
      ms: Date.now() - startedAt,
      detail: res.ok ? 'tracks endpoint answered' : `answered ${res.status}`,
    });
  } catch (error) {
    results.push({ name: 'engine library read', ok: false, ms: Date.now() - startedAt, detail: error instanceof Error ? error.message.slice(0, 120) : 'failed' });
  }

  // 2. Own writes — the session's Postgres path.
  const dbStarted = Date.now();
  try {
    const { db } = await import('../db/client.js');
    await db.execute('select 1' as never);
    results.push({ name: 'postgres round trip', ok: true, ms: Date.now() - dbStarted, detail: 'pool answered' });
  } catch (error) {
    results.push({
      name: 'postgres round trip',
      ok: false,
      ms: Date.now() - dbStarted,
      detail: error instanceof Error ? error.message.slice(0, 120) : 'failed',
    });
  }

  return results;
}
