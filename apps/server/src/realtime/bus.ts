import { env } from '../env.js';

import { Redis } from 'ioredis';

/**
 * Realtime fan-out bus (ADR-6).
 *
 * One process, one `Map` — until there is more than one process, at which
 * point a message published on instance A has to reach a browser connected to
 * instance B. That is the whole reason this file is written as a bus with a
 * transport rather than as a `Map` with helpers: the callers must never learn
 * which one is active.
 *
 * * **Local transport** (no `REDIS_URL`): publish fans out in-process. This is
 *   the default, and it is what a single container and every test uses.
 * * **Redis transport** (`REDIS_URL` set): publish goes to Redis pub/sub, and
 *   every instance — including the publisher's own, via its subscriber — fans
 *   the message out to its own connections. A message is therefore delivered
 *   exactly once per subscriber, and an instance that dies takes only its own
 *   connections with it.
 *
 * Failure policy: Redis is a *fan-out* dependency, not a correctness one. If
 * the connection drops, publishing still succeeds locally, so a listener
 * connected to this instance keeps receiving events and nobody gets a 500
 * because a message could not be broadcast to a machine they are not on.
 */

type Handler = (event: string, data: unknown) => void;

/** Live subscriptions in *this* process, keyed by user. */
const channels = new Map<string, Set<Handler>>();

/** The envelope that crosses Redis. Kept tiny: one JSON object per message. */
interface Envelope {
  userId: string;
  event: string;
  data: unknown;
}

const CHANNEL_PREFIX = 'rheoson:user:';

function channelFor(userId: string): string {
  return `${CHANNEL_PREFIX}${userId}`;
}

/** Hand a message to every local subscriber of one user. */
function dispatch(userId: string, event: string, data: unknown): void {
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

/** What a transport has to provide to be swappable. */
interface Transport {
  name: 'local' | 'redis';
  publish(userId: string, event: string, data: unknown): void;
}

const localTransport: Transport = {
  name: 'local',
  publish: (userId, event, data) => dispatch(userId, event, data),
};

let transport: Transport = localTransport;
let redisClient: Redis | null = null;

/**
 * Connect the Redis transport when one is configured. Called once at boot;
 * safe to call when it is not, and never fatal — see the failure policy above.
 */
export async function initBus(): Promise<'local' | 'redis'> {
  if (!env.REDIS_URL || transport.name === 'redis') return transport.name;

  try {
    const publisher = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });
    const subscriber = publisher.duplicate();

    // One pattern subscription per instance: the payload names its user, so a
    // single channel pattern covers every user without a per-user subscribe.
    await subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
    subscriber.on('pmessage', (_pattern, channel, message) => {
      try {
        const envelope = JSON.parse(message) as Envelope;
        if (envelope && typeof envelope.userId === 'string') {
          dispatch(envelope.userId, envelope.event, envelope.data);
        }
      } catch {
        // A malformed payload is not worth crashing a live process over.
      }
    });

    publisher.on('error', (error) => {
      console.warn('[bus] redis publisher error — falling back to local fan-out', error.message);
    });
    subscriber.on('error', (error) => {
      console.warn('[bus] redis subscriber error', error.message);
    });

    redisClient = publisher;
    transport = {
      name: 'redis',
      publish: (userId, event, data) => {
        const envelope: Envelope = { userId, event, data };
        // Local first: the people connected here must not wait on a round trip,
        // and a Redis outage must not silence them.
        dispatch(userId, event, data);
        publisher.publish(channelFor(userId), JSON.stringify(envelope)).catch((error: Error) => {
          console.warn('[bus] redis publish failed', error.message);
        });
      },
    };

    return 'redis';
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[bus] Redis unavailable (${reason}); continuing with local fan-out`);
    return 'local';
  }
}

/** Which transport is live — reported by `/health` so a deployment can prove it. */
export function busTransport(): 'local' | 'redis' {
  return transport.name;
}

/** Close the Redis connection during shutdown. */
export async function closeBus(): Promise<void> {
  const client = redisClient;
  redisClient = null;
  transport = localTransport;
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}

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

/** Publish to every live connection of one user, wherever they are connected. */
export function publish(userId: string, event: string, data: unknown): void {
  transport.publish(userId, event, data);
}

/** Publish to several users (e.g. both sides of a conversation). */
export function publishTo(userIds: string[], event: string, data: unknown): void {
  for (const id of userIds) publish(id, event, data);
}

/** Test/drain helper. */
export function subscriberCount(userId: string): number {
  return channels.get(userId)?.size ?? 0;
}
