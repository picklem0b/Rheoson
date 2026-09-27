/**
 * Shared input validation.
 *
 * These predicates guard values that cross a trust boundary — a query
 * parameter that becomes a path segment, a subprocess argument, or an
 * upstream URL. They live here so the client can refuse the same input the
 * server will refuse, instead of discovering it as a 400.
 */

/** The full alphabet a bare YouTube video id may contain. */
const TRACK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * True for a bare track id.
 *
 * Deliberately strict: a track id reaches an upstream resolver and, on the
 * engine side, a subprocess argument. Anything outside the id alphabet —
 * separators, spaces, shell metacharacters, a whole URL — must be refused
 * before it can become either.
 */
export function isTrackId(value: unknown): value is string {
  return typeof value === 'string' && TRACK_ID_RE.test(value);
}

/** True when a string looks like a usable http(s) URL. */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
