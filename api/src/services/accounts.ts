import type { Profile } from '@rheoson/shared'
import { database, hasDatabase } from '../db'
import type { Bindings } from '../env'
import { log } from '../lib/logger'
import { findUser } from '../repositories/users'

/**
 * Accounts: who is asking, and what the database knows about them.
 *
 * Routes call this; it is the only layer allowed to decide between the token and
 * the row. The token is always enough to answer, which is what lets a deployment
 * without a database still run.
 */

type Claims = Record<string, unknown> | null

function claim(claims: Claims, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = claims?.[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

export function profileFromClaims(claims: Claims, id: string): Profile {
  return {
    id,
    email: claim(claims, 'email', 'email_address'),
    displayName: claim(claims, 'displayName', 'name', 'full_name', 'given_name', 'username'),
    avatarUrl: claim(claims, 'avatarUrl', 'picture', 'image_url', 'avatar_url'),
    createdAt: null,
  }
}

export async function profileFor(env: Bindings, id: string, claims: Claims): Promise<Profile> {
  const fromToken = profileFromClaims(claims, id)
  if (!hasDatabase(env)) return fromToken

  try {
    const row = await findUser(database(env), id)
    if (!row) return fromToken

    return {
      id: row.id,
      email: row.email ?? fromToken.email,
      displayName: row.displayName ?? fromToken.displayName,
      avatarUrl: row.avatarUrl ?? fromToken.avatarUrl,
      createdAt: row.createdAt.toISOString(),
    }
  } catch (cause) {
    /* A profile read is a courtesy. The session is already proven by the token,
       so a slow database must not make the app look signed out. */
    log('warn', 'profile read failed, answering from the token', {
      userId: id,
      error: cause instanceof Error ? cause.message : String(cause),
    })
    return fromToken
  }
}
