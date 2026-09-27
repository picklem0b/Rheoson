import { eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { users } from '../db/schema.js';

/**
 * Session plumbing.
 *
 * The Clerk webhook mirrors accounts, but a **signed-in request is not a
 * guarantee the row exists**: a webhook can arrive late, be replayed after a
 * restore, or be disabled entirely in development. Every authenticated route
 * therefore goes through `ensureUser`, which creates the row it needs instead
 * of failing on a foreign-key violation the user cannot act on.
 *
 * The id is always the Clerk `sub` — the same `_id = clerk_id` contract the
 * Mongo era used, so stored keys survive the migration.
 */

export interface SessionProfile {
  id: string;
  username: string;
  imageUrl: string | null;
  email: string | null;
  createdAt: string;
}

/** A stable, non-identifying fallback name for an account with no username. */
function fallbackUsername(userId: string): string {
  return `listener-${userId.replace(/[^A-Za-z0-9]/g, '').slice(-6)}`;
}

export async function ensureUser(userId: string): Promise<SessionProfile> {
  const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (existing[0]) return shape(existing[0]);

  const inserted = await db
    .insert(users)
    .values({ id: userId, username: fallbackUsername(userId) })
    .onConflictDoNothing({ target: users.id })
    .returning();

  if (inserted[0]) return shape(inserted[0]);

  // A concurrent request created it between the select and the insert.
  const raced = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (raced[0]) return shape(raced[0]);

  // No database at all: give the caller a usable identity rather than a 500,
  // because every read path degrades to local-first anyway.
  return {
    id: userId,
    username: fallbackUsername(userId),
    imageUrl: null,
    email: null,
    createdAt: new Date().toISOString(),
  };
}

/** Public profile fields for a set of ids — batch, for member lists. */
export async function profilesFor(userIds: string[]): Promise<Array<{ id: string; username: string; imageUrl: string | null }>> {
  const unique = [...new Set(userIds.filter(Boolean))].slice(0, 50);
  if (unique.length === 0) return [];

  const rows = await db.select().from(users);
  const byId = new Map(rows.map((row) => [row.id, row]));

  // Input order is preserved: a member list rendered out of order looks like a
  // data bug to the person reading it.
  return unique.map((id) => {
    const row = byId.get(id);
    return {
      id,
      username: row?.username ?? fallbackUsername(id),
      imageUrl: row?.imageUrl ?? null,
    };
  });
}

function shape(row: { id: string; username: string; imageUrl: string | null; email: string | null; createdAt: Date | string }): SessionProfile {
  return {
    id: row.id,
    username: row.username,
    imageUrl: row.imageUrl,
    email: row.email,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}
