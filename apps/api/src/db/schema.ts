import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * The schema, one table per thing the product remembers.
 *
 * Two rules shape it, and they hold for every table M1 adds:
 *
 *   1. Provider URLs are never stored. A track keeps the provider id, which is
 *      what resolves a fresh signed URL at play time.
 *   2. A user id is never a foreign key to anything the client sent. Every row
 *      that belongs to someone is keyed on the Clerk subject the worker verified.
 *
 * Timestamps are `timestamptz` and always UTC. Ids are text where the id is a
 * string the client already holds, and a sequence where order is the point.
 */

export const users = pgTable('users', {
  /** Clerk subject. The only identity the API trusts. */
  id: text('id').primaryKey(),
  email: text('email'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  /** Set by a webhook, not by a delete: a returning account keeps its library. */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})
