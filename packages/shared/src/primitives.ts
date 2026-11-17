import { z } from 'zod'

/**
 * Shared zod primitives.
 *
 * These exist so a schema at the API boundary and the schema the client parses
 * with are the same object. Anything both sides must agree on lives here, not
 * in a hand-written type that mirrors it.
 */

export const nonEmptyString = z.string().trim().min(1)

/** ISO 8601 with an offset. Stored and transmitted as UTC. */
export const timestampSchema = z.iso.datetime({ offset: true })

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
})

export type Pagination = z.infer<typeof paginationSchema>

/** Cursor pages, so a list never has to be counted to be read. */
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  })

export const idListSchema = z.array(nonEmptyString).max(500)
