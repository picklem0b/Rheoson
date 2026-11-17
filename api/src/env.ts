/**
 * Bindings and per-request values.
 *
 * Secrets are optional in the type because a checkout without them must still
 * boot: a route that needs one says so at the point of use rather than the whole
 * worker failing to start.
 */
export interface Bindings {
  ENVIRONMENT?: string
  APP_ORIGINS?: string
  DATABASE_URL?: string
  CLERK_JWKS_URL?: string
  CLERK_ISSUER?: string
  RATE_LIMIT_PER_MINUTE?: string
}

export interface Variables {
  requestId: string
  userId: string | null
  claims: Record<string, unknown> | null
}

export type AppEnv = { Bindings: Bindings; Variables: Variables }
