/**
 * Realtime fan-out bus (ADR-6).
 *
 * M2 runs in one process: SSE connections subscribe to their user channel
 * here, services publish to it. The publish/subscribe surface is the
 * seam — moving to Redis pub/sub later means swapping this file's
 * internals, never the callers.
 */

type Handler = (event: string, data: unknown) => void;

const channels = new Map<string, Set<Handler>>();

/** Subscribe a connection to a user's channel. Returns the unsubscribe fn. */
export function subscribe(userId: string, handler: Handler): () => void {
  let set = channels.get(userId);
  if (!set) {
    set = new Set();
    channels.set(userId, set);
  }
  set.add(handler);
  return () => {
    set!.delete(handler);
    if (set!.size === 0) channels.delete(userId);
  };
}

/** Publish to every live connection of one user. */
export function publish(userId: string, event: string, data: unknown): void {
  const set = channels.get(userId);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(event, data);
    } catch {
      // A dead connection must never break the caller's write path.
      set.delete(handler);
    }
  }
}

/** Publish to several users (e.g. both sides of a conversation). */
export function publishTo(userIds: string[], event: string, data: unknown): void {
  for (const id of userIds) publish(id, event, data);
}

/** Test/drain helper. */
export function subscriberCount(userId: string): number {
  return channels.get(userId)?.size ?? 0;
}
