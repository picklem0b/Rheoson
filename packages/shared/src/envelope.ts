import { z } from 'zod'

/**
 * Every response from /api/v1 has one of two shapes, and both carry the request
 * id so a user report can be joined to a log line.
 *
 * The HTTP status is the transport signal and is never duplicated inside the
 * body. The body carries the DCCNN code, which is the traceable part.
 */

export const errorCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}\d{2}$/, 'expected a five-character DCCNN error code')

export const errorBodySchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  requestId: z.string().min(1),
})

export type ErrorBody = z.infer<typeof errorBodySchema>

export interface OkBody<T> {
  ok: true
  data: T
  requestId: string
}

/**
 * The success envelope without a payload schema.
 *
 * A caller that validates the payload separately uses this, so the envelope is
 * described once instead of once per call site.
 */
export const okEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: z.unknown(),
  requestId: z.string().min(1),
})

export function okBody<T>(requestId: string, data: T): OkBody<T> {
  return { ok: true, data, requestId }
}

export function errorBody(
  requestId: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ErrorBody {
  return details
    ? { ok: false, error: { code, message, details }, requestId }
    : { ok: false, error: { code, message }, requestId }
}
