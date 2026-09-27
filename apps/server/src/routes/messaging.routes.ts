import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireUser } from '../auth/plugin.js';
import { subscribe } from '../realtime/bus.js';
import {
  getProfiles,
  getOrCreateConversation,
  listConversations,
  listMessages,
  presenceSnapshot,
  sendMessage,
  setPresence,
} from '../services/messaging.service.js';

/**
 * Messaging routes — REST is the always-works path and the source of truth;
 * SSE (`/realtime`) is the live fast path (ADR-6). Both funnel through the
 * same service, so validation, rate limit and DCCNN codes are identical.
 */

const SharePayloadSchema = z.object({
  type: z.enum(['track', 'lyrics', 'playlist', 'album', 'artist', 'blend']),
  id: z.string().min(1).max(256),
  title: z.string().min(1).max(300),
  subtitle: z.string().max(300).optional(),
  imageUrl: z.string().max(1000).optional(),
  text: z.string().max(4000).optional(),
});

const SendMessageSchema = z
  .object({
    peerId: z.string().min(1).max(128),
    body: z.string().max(2000).optional(),
    share: SharePayloadSchema.optional(),
  })
  .refine((v) => (v.body?.trim() ?? '') !== '' || v.share !== undefined, {
    message: 'Message needs text or a share',
  });

const PresenceSchema = z.object({
  trackId: z.string().max(256).nullable(),
  title: z.string().max(300).nullable(),
  artist: z.string().max(300).nullable(),
});

const ProfilesSchema = z.object({
  ids: z.array(z.string().min(1).max(128)).max(50),
});

export const registerMessagingRoutes = (app: FastifyInstance): void => {
  /** Batch display info — order preserved, unknown ids degrade. */
  app.post('/api/messages/profiles', async (request, reply) => {
    requireUser(request);
    const { ids } = ProfilesSchema.parse(request.body);
    const profiles = await getProfiles(ids);
    reply.send({ profiles });
  });

  /** All conversations for the caller, newest-activity order is client-side. */
  app.get('/api/messages/conversations', async (request, reply) => {
    requireUser(request);
    const conversations = await listConversations(request.userId!);
    reply.send({ conversations });
  });

  /** Open (or get) a thread with a peer. */
  app.post('/api/messages/conversations', async (request, reply) => {
    const userId = requireUser(request);
    const { peerId } = z.object({ peerId: z.string().min(1).max(128) }).parse(request.body);
    const conversationId = await getOrCreateConversation(userId, peerId);
    reply.status(201).send({ conversationId });
  });

  /** History — cursor is `before` (a seq), newest first. */
  app.get('/api/messages/:conversationId', async (request, reply) => {
    requireUser(request);
    const { conversationId } = request.params as { conversationId: string };
    const q = z
      .object({ before: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(100).optional() })
      .parse(request.query);
    const messages = await listMessages(request.userId!, conversationId, q.before, q.limit);
    reply.send({ messages });
  });

  /** Send — REST always works; SSE listeners get `message:new` too. */
  app.post('/api/messages/send', async (request, reply) => {
    const userId = requireUser(request);
    const input = SendMessageSchema.parse(request.body);
    const message = await sendMessage({
      senderId: userId,
      peerId: input.peerId,
      body: input.body ?? null,
      share: input.share ?? null,
    });
    reply.status(201).send({ message });
  });

  /** Presence heartbeat — rides from the player; payloads are never stored. */
  app.post('/api/messages/presence', async (request, reply) => {
    const userId = requireUser(request);
    const p = PresenceSchema.parse(request.body);
    setPresence(userId, p.trackId && p.title ? { id: p.trackId, title: p.title, artist: p.artist ?? undefined } : null);
    reply.send({ ok: true });
  });

  /** Presence snapshot for a set of peers ("{username} listening to {song}"). */
  app.post('/api/messages/presence/snapshot', async (request, reply) => {
    requireUser(request);
    const { ids } = ProfilesSchema.parse(request.body);
    reply.send({ presence: presenceSnapshot(ids) });
  });

  /**
   * Live event stream (SSE, ADR-6). Auth via query token is not allowed, so
   * EventSource on web passes the session cookie; native shells attach the
   * Authorization header through a fetch-based SSE client instead.
   */
  app.get('/realtime', async (request, reply) => {
    const userId = requireUser(request);
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(`retry: 3000\n\n`);

    const unsubscribe = subscribe(userId, (event, data) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    });

    // Heartbeat keeps proxies from eating the stream.
    const heartbeat = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, 25_000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    // Intentionally never resolving: the response stays open until close.
    await new Promise(() => {});
  });
};
