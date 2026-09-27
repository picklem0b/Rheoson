import { and, desc, eq, lt, or } from 'drizzle-orm';

import { db } from '../db/client.js';
import { conversations, messages, users } from '../db/schema.js';
import { env } from '../env.js';
import { badRequest, notFound, tooMany } from '../errors.js';
import { publishTo } from '../realtime/bus.js';

/**
 * Messaging service — the social fast path.
 *
 * Mirrors the contract proven on the current stack (messaging_service.py):
 * one sender-side rate limit, strict share-payload validation, both peers
 * receive the event, REST is the source of truth while SSE delivers live.
 */

const ALLOWED_SHARE_TYPES = ['track', 'lyrics', 'playlist', 'album', 'artist', 'blend'] as const;
type ShareType = (typeof ALLOWED_SHARE_TYPES)[number];

export interface SharePayload {
  type: ShareType;
  id: string; // track videoId / playlist / blend / album / artist id
  title: string;
  subtitle?: string;
  imageUrl?: string;
  /** lyrics shares carry the quoted line(s) */
  text?: string;
}

export interface OutgoingMessage {
  id: string;
  conversationId: string;
  senderId: string;
  seq: number;
  body: string | null;
  share: SharePayload | null;
  createdAt: Date;
}

export interface PublicUser {
  id: string;
  username: string;
  imageUrl: string | null;
}

// ── Presence (in-process in M2; the shape is what matters) ────

interface PresenceEntry {
  track: { id: string; title: string; artist?: string } | null;
  updatedAt: number;
}

const presence = new Map<string, PresenceEntry>();
const PRESENCE_TTL_MS = 90_000;

export function setPresence(userId: string, track: PresenceEntry['track']): void {
  presence.set(userId, { track, updatedAt: Date.now() });
}

export function getPresenceMap(): Map<string, PresenceEntry> {
  return presence;
}

function presenceOf(userId: string): PublicUser & { listeningTo: PresenceEntry['track'] | null } | null {
  const entry = presence.get(userId);
  if (!entry || Date.now() - entry.updatedAt > PRESENCE_TTL_MS) {
    presence.delete(userId);
    return null;
  }
  return { id: userId, username: '', imageUrl: null, listeningTo: entry.track };
}

// ── Conversations ─────────────────────────────────────────────

/** Ordered conversation pair key — (a,b) and (b,a) are the same row. */
function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function getOrCreateConversation(userId: string, peerId: string): Promise<string> {
  if (userId === peerId) {
    throw badRequest('MVA04', 'Cannot open a conversation with yourself');
  }

  // Peer must exist (mirror is webhook-populated).
  const [peer] = await db.select({ id: users.id }).from(users).where(eq(users.id, peerId)).limit(1);
  if (!peer) throw notFound('MNF02', 'User not found');

  const [a, b] = pairKey(userId, peerId);
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.userAId, a), eq(conversations.userBId, b)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(conversations)
    .values({ userAId: a, userBId: b })
    .onConflictDoNothing()
    .returning({ id: conversations.id });

  if (created) return created.id;

  // Lost a race — read the winner.
  const [winner] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.userAId, a), eq(conversations.userBId, b)))
    .limit(1);
  if (!winner) throw notFound('MNF01', 'Conversation vanished mid-create');
  return winner.id;
}

export async function listConversations(userId: string): Promise<
  Array<{
    peer: PublicUser;
    lastMessage: { body: string | null; shareType: string | null; createdAt: Date } | null;
  }>
> {
  const rows = await db
    .select()
    .from(conversations)
    .where(or(eq(conversations.userAId, userId), eq(conversations.userBId, userId)));

  const result: Array<{
    peer: PublicUser;
    lastMessage: { body: string | null; shareType: string | null; createdAt: Date } | null;
  }> = [];

  const peerIds = rows.map((conv) => (conv.userAId === userId ? conv.userBId : conv.userAId));
  const profiles = await getProfiles(peerIds);
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  for (const conv of rows) {
    const peerId = conv.userAId === userId ? conv.userBId : conv.userAId;
    const [last] = await db
      .select({
        body: messages.body,
        shareType: messages.shareType,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(desc(messages.seq))
      .limit(1);

    result.push({
      peer: profileById.get(peerId) ?? { id: peerId, username: peerId, imageUrl: null },
      lastMessage: last ?? null,
    });
  }
  return result;
}

/**
 * Batch display info — same contract as POST /api/messages/profiles on the
 * current stack: order preserved, unknown ids degrade to placeholders.
 */
export async function getProfiles(ids: string[]): Promise<PublicUser[]> {
  const unique = [...new Set(ids)].filter((id) => id.length > 0).slice(0, 50);
  if (unique.length === 0) return [];

  const rows = await db
    .select({ id: users.id, username: users.username, imageUrl: users.imageUrl })
    .from(users)
    .where(or(...unique.map((id) => eq(users.id, id))));

  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .slice(0, 50)
    .map((id) => byId.get(id) ?? { id, username: id, imageUrl: null });
}

// ── Sending ───────────────────────────────────────────────────

const MAX_BODY_LEN = 2000;

export async function sendMessage(opts: {
  senderId: string;
  peerId: string;
  body?: string | null;
  share?: SharePayload | null;
}): Promise<OutgoingMessage> {
  const { senderId, peerId, body, share } = opts;

  if (!body?.trim() && !share) {
    throw badRequest('MVA01', 'Message needs text or a share');
  }
  if (body && body.length > MAX_BODY_LEN) {
    throw badRequest('MVA02', `Message too long (max ${MAX_BODY_LEN})`);
  }
  if (share && !ALLOWED_SHARE_TYPES.includes(share.type)) {
    throw badRequest('MVA03', `Unknown share type: ${share.type}`);
  }

  await assertRate(senderId);

  const conversationId = await getOrCreateConversation(senderId, peerId);

  // seq = max(seq)+1 per conversation. Small conversations + unique index
  // make this safe in practice; the retry below covers the rare tie.
  const [last] = await db
    .select({ seq: messages.seq })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.seq))
    .limit(1);
  const seq = (last?.seq ?? 0) + 1;

  const inserted = await db
    .insert(messages)
    .values({
      conversationId,
      senderId,
      seq,
      body: body?.trim() || null,
      shareType: share?.type ?? null,
      sharePayload: share ?? null,
    })
    .returning();

  const row = inserted[0];
  const outgoing: OutgoingMessage = {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    seq: row.seq,
    body: row.body,
    share: (row.sharePayload as SharePayload | null) ?? null,
    createdAt: row.createdAt,
  };

  // Fan out live to both peers (ADR-6 bus; sender gets the ack event too).
  publishTo([senderId, peerId], 'message:new', outgoing);

  return outgoing;
}

export async function listMessages(
  userId: string,
  conversationId: string,
  beforeSeq?: number,
  limit = 50,
): Promise<OutgoingMessage[]> {
  const conv = await requireMembership(userId, conversationId);

  const rows = await db
    .select()
    .from(messages)
    .where(
      beforeSeq
        ? and(eq(messages.conversationId, conv.id), lt(messages.seq, beforeSeq))
        : eq(messages.conversationId, conv.id),
    )
    .orderBy(desc(messages.seq))
    .limit(Math.min(limit, 100));

  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    seq: row.seq,
    body: row.body,
    share: (row.sharePayload as SharePayload | null) ?? null,
    createdAt: row.createdAt,
  }));
}

async function requireMembership(userId: string, conversationId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) throw notFound('MNF01', 'Conversation not found');
  if (conv.userAId !== userId && conv.userBId !== userId) {
    // 404, not 403 — never leak the existence of someone else's thread.
    throw notFound('MNF01');
  }
  return conv;
}

/** Presence snapshot for the caller's known peers. */
export function presenceSnapshot(userIds: string[]): Array<PublicUser & { listeningTo: PresenceEntry['track'] | null }> {
  return userIds
    .map((id) => presenceOf(id))
    .filter((p): p is NonNullable<typeof p> => p !== null);
}

// ── Rate limit (sender-side, mirrors MLM01) ───────────────────

const sendTimestamps = new Map<string, number[]>();

async function assertRate(userId: string): Promise<void> {
  const now = Date.now();
  const windowMs = 60_000;
  const list = (sendTimestamps.get(userId) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= env.MESSAGE_RATE_PER_MIN) {
    throw tooMany('MLM01', `Max ${env.MESSAGE_RATE_PER_MIN} messages per minute`);
  }
  list.push(now);
  sendTimestamps.set(userId, list);
}

/** Test helper — the rate limiter is process state; tests must reset it. */
export function resetMessagingState(): void {
  sendTimestamps.clear();
  presence.clear();
}
