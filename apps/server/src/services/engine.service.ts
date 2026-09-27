import { env } from '../env.js';
import { ApiError } from '../errors.js';

/**
 * The engine client — the server's only door to the Python muscles.
 *
 * Three rules, all of them ported from hard experience on the current stack:
 *
 * 1. **Every call is authenticated with the service token**, and the owner is
 *    passed as a header the engine trusts — the client never names an owner.
 * 2. **A 5xx from the engine is not passed through as-is.** The engine's codes
 *    describe its own world; the caller gets the code the API's registry owns,
 *    because that is the one the client's error page and ⓘ panel know.
 * 3. **`body` is opaque when it is bytes.** Artwork and audio are relayed
 *    without being parsed, so the server never has to understand media.
 */

/** What the engine reports when a code came back on the wire. */
interface EngineErrorBody {
  error?: string;
  code?: string;
}

const TIMEOUT_MS = 30_000;
/** Probing and version checks should not hold a request open. */
const HEALTH_TIMEOUT_MS = 3_000;

function headers(owner?: string): Record<string, string> {
  return {
    Accept: 'application/json',
    ...(env.ENGINE_TOKEN ? { Authorization: `Bearer ${env.ENGINE_TOKEN}` } : {}),
    ...(owner ? { 'X-Owner-Id': owner } : {}),
  };
}

/** The engine is optional: this answers false instead of throwing. */
export async function engineHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${env.ENGINE_URL}/health`, {
      headers: headers(),
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Read the engine's error body and translate it.
 *
 * The engine already speaks DCCNN, so a code it sends is accepted verbatim
 * (it is the same registry, exported from the same package) — but a missing or
 * unknown code becomes the caller's fallback, never an empty error.
 */
async function translate(res: Response, fallback: string): Promise<ApiError> {
  let code: string | undefined;
  let detail: string | undefined;
  try {
    const body = (await res.json()) as EngineErrorBody;
    code = typeof body.code === 'string' && body.code ? body.code : undefined;
    detail = typeof body.error === 'string' ? body.error : undefined;
  } catch {
    // A non-JSON body is a crash, not a crafted error: the fallback stands.
  }

  if (res.status === 404) return new ApiError((code as never) ?? fallback, 404, detail);
  if (res.status === 400 || res.status === 416) return new ApiError((code as never) ?? fallback, 400, detail);
  if (res.status === 401 || res.status === 403) return new ApiError('ASE02', 401, detail);
  if (res.status === 409) return new ApiError((code as never) ?? fallback, 409, detail);
  if (res.status === 429) return new ApiError((code as never) ?? fallback, 429, detail);
  if (res.status === 503) return new ApiError((code as never) ?? 'DEN02', 503, detail);
  return new ApiError((code as never) ?? fallback, 502, detail);
}

/**
 * Call the engine and parse JSON.
 *
 * `unavailable` is the code returned when the engine cannot be reached at all:
 * callers that have a degraded mode pass their own so the client's copy names
 * the missing capability rather than a generic gateway failure.
 */
export async function engineJson<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
    owner?: string;
    unavailable?: string;
    fallback?: string;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const { method = 'GET', body, owner, unavailable = 'SUP02', fallback = 'SUP02' } = options;

  let res: Response;
  try {
    res = await fetch(`${env.ENGINE_URL}${path}`, {
      method,
      headers: {
        ...headers(owner),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new ApiError(unavailable as never, 503, `Engine unreachable: ${reason}`);
  }

  if (!res.ok) throw await translate(res, fallback);
  return (await res.json()) as T;
}

/**
 * Open a response whose body is relayed, not parsed — artwork and local audio.
 *
 * The status and headers are returned with the body so the caller can mirror
 * range metadata instead of inventing it.
 */
export async function engineStream(
  path: string,
  options: { headers?: Record<string, string>; owner?: string; unavailable?: string; timeoutMs?: number } = {},
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${env.ENGINE_URL}${path}`, {
      headers: { ...(options.headers ?? {}), ...headers(options.owner) },
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new ApiError((options.unavailable ?? 'SUP02') as never, 503, `Engine unreachable: ${reason}`);
  }
  if (!res.ok) throw await translate(res, 'SUP04');
  return res;
}

/** Forget the engine's library cache — called after a download completes. */
export async function rescanLibrary(): Promise<void> {
  await engineJson('/library/rescan', { method: 'POST', unavailable: 'SUP02' });
}
