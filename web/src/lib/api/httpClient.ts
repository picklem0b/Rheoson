import { ERRORS, errorBodySchema, okEnvelopeSchema } from '@rheoson/shared'
import type { z } from 'zod'
import { ApiFailure } from './apiError'

/**
 * Where /api/v1 lives.
 *
 * The web app is deployed by Vercel and the API by Workers, so production is two
 * origins and the base arrives as VITE_API_BASE_URL. Development leaves it unset,
 * which keeps every request same-origin through the Vite proxy.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '')

export interface GetOptions<S extends z.ZodType> {
  schema: S
  query?: Record<string, string | number | undefined | null>
  signal?: AbortSignal
}

function url(path: string, query: GetOptions<z.ZodType>['query']): string {
  const base = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return base

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }

  const search = params.toString()
  return search ? `${base}?${search}` : base
}

/**
 * The one way the app reads from the API.
 *
 * The success body is checked against the caller's schema, so a contract drift
 * fails here instead of becoming an undefined three screens later. Failures
 * become ApiFailure with the code intact.
 */
export async function apiGet<S extends z.ZodType>(
  path: string,
  options: GetOptions<S>,
): Promise<z.infer<S>> {
  const { schema, signal } = options

  let response: Response
  try {
    response = await fetch(url(path, options.query), {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiFailure({ code: ERRORS.CORE.UNEXPECTED, status: 0, message: 'Rheoson is unreachable' })
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const failure = errorBodySchema.safeParse(payload)
    throw new ApiFailure(
      failure.success
        ? {
            code: failure.data.error.code,
            status: response.status,
            message: failure.data.error.message,
          }
        : { code: ERRORS.CORE.UNEXPECTED, status: response.status },
    )
  }

  const envelope = okEnvelopeSchema.safeParse(payload)
  if (!envelope.success) {
    throw new ApiFailure({ code: ERRORS.CORE.UNEXPECTED, status: response.status })
  }

  const data = schema.safeParse(envelope.data.data)
  if (!data.success) {
    throw new ApiFailure({ code: ERRORS.CORE.UNEXPECTED, status: response.status })
  }

  return data.data
}

/** Shown on the status page so the configured origin is never a guess. */
export const apiBaseUrl = API_BASE
