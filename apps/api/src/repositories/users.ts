import { eq } from 'drizzle-orm'
import type { Database } from '../db'
import { users } from '../db'

/**
 * Accounts, as rows.
 *
 * The only place that writes `users`. A repository takes the database handle
 * rather than reaching for one, so the caller decides which deployment it is
 * talking to.
 */

export interface AccountPatch {
  id: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
}

export type UserRow = typeof users.$inferSelect

/**
 * Idempotent by construction: Clerk delivers an event at least once, so the same
 * `user.updated` may arrive twice and must not create a second account.
 */
export async function upsertUser(db: Database, account: AccountPatch): Promise<void> {
  const now = new Date()

  await db
    .insert(users)
    .values({ ...account, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: account.email,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        updatedAt: now,
      },
    })
}

export async function findUser(db: Database, id: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return row ?? null
}

/**
 * A delete marks the row instead of removing it.
 *
 * Clerk can resurrect an account with the same subject, and the library behind
 * that subject is the person's. A cascade would delete it on a webhook typo.
 */
export async function softDeleteUser(db: Database, id: string): Promise<void> {
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id))
}
