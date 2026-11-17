import type { HealthReport } from '@rheoson/shared'
import type { Bindings } from '../env'

/**
 * What is configured, never what it contains.
 *
 * A missing secret is a state the app has a surface for, so health reports it as
 * a string rather than failing a request that a monitor depends on.
 */
export function healthReport(env: Bindings): HealthReport {
  return {
    status: 'ok',
    environment: env.ENVIRONMENT ?? 'development',
    checks: {
      database: env.DATABASE_URL ? 'configured' : 'unconfigured',
      accounts: env.CLERK_JWKS_URL ? 'configured' : 'unconfigured',
    },
  }
}
