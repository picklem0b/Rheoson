import { z } from 'zod'

/**
 * The signed-in person, as the client sees them.
 *
 * Provider-neutral on purpose: the API decides whether these fields came from a
 * token, a webhook or the database, and the app never learns which.
 */
export const profileSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().nullable(),
  displayName: z.string().min(1).max(64).nullable(),
  avatarUrl: z.url().nullable(),
  createdAt: z.iso.datetime().nullable(),
})

export type Profile = z.infer<typeof profileSchema>
