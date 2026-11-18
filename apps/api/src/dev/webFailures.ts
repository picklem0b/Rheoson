/**
 * A V2 error body.
 *
 * The V2 client reads `detail` (and an optional `code`), so the bridge answers in
 * that shape rather than the V3 envelope. Keeping it in one place means a route
 * cannot accidentally invent a third error format.
 */
export function failedBody(detail: string, code?: string): { detail: string; code?: string } {
  return code ? { detail, code } : { detail }
}
