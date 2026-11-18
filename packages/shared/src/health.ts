import { z } from 'zod'

/**
 * What /health reports.
 *
 * It answers even when nothing is configured, because "the worker runs" and
 * "the database answers" are different questions and a monitor needs to tell
 * them apart. Checks report whether a binding exists, never its value.
 */
export const healthReportSchema = z.object({
  status: z.literal('ok'),
  environment: z.string().min(1),
  checks: z.object({
    database: z.enum(['configured', 'unconfigured']),
    accounts: z.enum(['configured', 'unconfigured']),
    // A catalogue needs one working provider, not every one: `partial` is a
    // healthy state, `unconfigured` is the one that means no music at all.
    providers: z.enum(['configured', 'partial', 'unconfigured']),
  }),
})

export type HealthReport = z.infer<typeof healthReportSchema>
