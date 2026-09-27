import { Readable } from 'node:stream';

import { env } from '../env.js';
import { ApiError } from '../errors.js';

/**
 * Clients for the optional services: the py engine (resolution) and the Go
 * relay (bytes).
 *
 * Both are *optional by design*. The server probes before it commits, caches
 * the answer briefly, and falls back to doing the work itself — six runtimes
 * must never mean six single points of failure. A service that is down must
 * cost reliability, not availability.
 */

/** Resolved playback source for a track. */
export interface ResolvedTrack {
  url: string;
  contentType: string;
  /** Unix seconds; 0 when the URL does not expire. */
  expiresAt: number;
  filename?: string;
}

export interface ProbedTrack {
  mime: string;
  bytes: number | null;
}

/** An open upstream response, with the pieces a proxy needs. */
export interface UpstreamResponse {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

/** CLI plumbing: how long a health verdict is reused. */
const HEALTH_TTL_MS = 10_000;

/** Leave headroom before the CDN signature lapses rather than racing it. */
const RESOLVE_EXPIRY_MARGIN_MS = 60_000;

const resolveCache = new Map<string, ResolvedTrack>();
const healthCache = new Map<string, { at: number; healthy: boolean }>();
/** In-flight probes, so N concurrent requests cause one probe rather than N. */
const healthInFlight = new Map<string, Promise<boolean>>();

function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Probe a service's health, memoised for {@link HEALTH_TTL_MS}.
 *
 * Two protections, both load-related: a cached verdict avoids probing on
 * every request, and coalescing in-flight probes stops a burst of concurrent
 * requests from each opening its own probe against a service that is already
 * known to be struggling — exactly when adding load is least welcome.
 *
 * A probe that throws is a `false`, never an error: callers use this to
 * decide between two working paths, so a failed probe must not itself fail
 * the request.
 */
export async function serviceHealthy(name: string, url: string, healthPath: string): Promise<boolean> {
  const cached = healthCache.get(name);
  if (cached && Date.now() - cached.at < HEALTH_TTL_MS) {
    return cached.healthy;
  }

  const pending = healthInFlight.get(name);
  if (pending) return pending;

  const probe = (async (): Promise<boolean> => {
    let healthy = false;
    try {
      const res = await fetch(`${url}${healthPath}`, {
        signal: AbortSignal.timeout(2_000),
      });
      healthy = res.ok;
      // Drain the small health body so the connection can be reused.
      await res.arrayBuffer().catch(() => undefined);
    } catch {
      healthy = false;
    }
    healthCache.set(name, { at: Date.now(), healthy });
    return healthy;
  })();

  healthInFlight.set(name, probe);
  try {
    return await probe;
  } finally {
    healthInFlight.delete(name);
  }
}

/** Forget memoised health state — used by tests and the diagnostics surface. */
export function resetServiceHealthCache(): void {
  healthCache.clear();
  healthInFlight.clear();
}

/** Drop the in-memory resolution cache — used by tests. */
export function resetResolveCache(): void {
  resolveCache.clear();
}

/**
 * Resolve a track through the engine.
 *
 * Results are cached until shortly before the CDN URL's own expiry: resolving
 * costs an extraction, and a replay must not pay for it again. Pass
 * `fresh: true` after a URL the CDN has already refused.
 */
export async function resolveTrack(
  trackId: string,
  options: { fresh?: boolean } = {},
): Promise<ResolvedTrack> {
  const cached = resolveCache.get(trackId);
  if (
    !options.fresh &&
    cached &&
    (cached.expiresAt === 0 || cached.expiresAt * 1000 - RESOLVE_EXPIRY_MARGIN_MS > Date.now())
  ) {
    return cached;
  }

  let res: Response;
  try {
    // `fresh=1` is not a cache hint for this process — it is how the engine
    // knows to skip *its* cache. Without it a re-mint after a refused URL hands
    // back the same refused URL, and the retry below is a no-op that looks like
    // a retry. (The engine's cache lives for hours; this one lives for
    // minutes.)
    const path = `/resolve/${encodeURIComponent(trackId)}${options.fresh ? '?fresh=1' : ''}`;
    res = await fetch(`${env.ENGINE_URL}${path}`, {
      headers: authHeaders(env.ENGINE_TOKEN),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (cause) {
    throw new ApiError('SUP02', 502, `Resolution engine unreachable: ${messageOf(cause)}`);
  }

  if (res.status === 503) {
    throw new ApiError('DEN02', 503);
  }
  if (res.status === 404) {
    // A definitive "this track is not available" — the client should stop
    // retrying and say so, not show a server error.
    throw new ApiError('SUP01', 404);
  }
  if (!res.ok) {
    throw new ApiError('SUP02', 502, `Resolution failed (${res.status})`);
  }

  const payload = (await res.json()) as Partial<ResolvedTrack>;
  if (!payload.url || typeof payload.url !== 'string') {
    throw new ApiError('SUP02', 502, 'Resolution returned no URL');
  }
  const resolved: ResolvedTrack = {
    url: payload.url,
    contentType: payload.contentType ?? 'audio/mpeg',
    expiresAt: typeof payload.expiresAt === 'number' ? payload.expiresAt : 0,
    filename: payload.filename,
  };
  resolveCache.set(trackId, resolved);
  return resolved;
}

/** Ask the engine for real content type and length, reading no media bytes. */
export async function probeTrack(trackId: string): Promise<ProbedTrack | null> {
  try {
    const res = await fetch(`${env.ENGINE_URL}/probe/${encodeURIComponent(trackId)}`, {
      headers: authHeaders(env.ENGINE_TOKEN),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as Partial<ProbedTrack>;
    return { mime: payload.mime ?? 'audio/mpeg', bytes: payload.bytes ?? null };
  } catch {
    // Probing is a nicety: its failure must never fail a play.
    return null;
  }
}

/** True when the relay is up and worth pointing at. */
export async function relayAvailable(): Promise<boolean> {
  return serviceHealthy('relay', env.RELAY_URL, '/relay/health');
}

/**
 * Open a stream through the relay, forwarding the client's Range header.
 *
 * Returns `null` when the relay cannot serve this request, which is the
 * signal to fall back — a 5xx from the relay is "use the other path", never
 * an error the user sees.
 */
export async function openRelayStream(
  trackId: string,
  range: string | undefined,
): Promise<UpstreamResponse | null> {
  return openStream(`${env.RELAY_URL}/relay/audio?track=${encodeURIComponent(trackId)}`, range, {
    headers: authHeaders(env.RELAY_TOKEN),
  });
}

/**
 * Open a stream straight from the resolved CDN URL (the fallback path).
 *
 * Two real-world details live here, both measured against a live CDN:
 *
 * 1. **The resolved URLs are range-gated.** A request with no `Range` header
 *    gets no response at all until the client gives up, while `bytes=0-`
 *    answers with the entire file in a single 206. A client that asks for
 *    nothing therefore still has a range asked for on its behalf.
 * 2. **A full-span 206 is presented as a plain 200.** The client did not ask
 *    for a partial response, and handing it one it never requested makes some
 *    players wait for a second range. A *capped* 206 is passed through
 *    untouched — calling a truncated body complete would be a silent lie.
 */
export async function openDirectStream(url: string, range: string | undefined): Promise<UpstreamResponse | null> {
  const implicitRange = range === undefined || range === '';
  const response = await openStream(url, implicitRange ? 'bytes=0-' : range);
  if (!response || !implicitRange || response.status !== 206) return response;
  if (!spansWholeFile(response.headers.get('content-range'))) return response;

  const headers = new Headers(response.headers);
  headers.delete('content-range');
  return { status: 200, headers, body: response.body };
}

/** True when `bytes 0-<size-1>/<size>` describes the whole file. */
function spansWholeFile(contentRange: string | null): boolean {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/.exec((contentRange ?? '').trim());
  if (!match) return false;
  const [, start, end, total] = match;
  return Number(start) === 0 && Number(total) > 0 && Number(end) === Number(total) - 1;
}

async function openStream(
  url: string,
  range: string | undefined,
  init: { headers?: Record<string, string> } = {},
): Promise<UpstreamResponse | null> {
  const headers: Record<string, string> = { Accept: '*/*', ...init.headers };
  if (range) headers.Range = range;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok && res.status !== 206) {
      const status = res.status;
      await res.body?.cancel().catch(() => undefined);
      // 5xx means "this path is broken, try the other one"; 4xx means the
      // track itself is unavailable and retrying elsewhere is pointless.
      return status >= 500 ? null : { status, headers: res.headers, body: null };
    }
    return { status: res.status, headers: res.headers, body: res.body };
  } catch {
    return null;
  }
}

/** Wrap a web stream so Fastify can pipe it without buffering a whole track. */
export function toNodeStream(body: ReadableStream<Uint8Array>): Readable {
  return Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
