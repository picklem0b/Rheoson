import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { Webhook } from 'svix';

import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { env } from '../env.js';

/**
 * Clerk user lifecycle → Postgres mirror (ADR-1). The `users` row is created
 * from user.created, updated on user.updated, deleted on user.deleted.
 * Profile facts the user authors (profiles table) are untouched: the webhook
 * only manages the Clerk-mirror columns.
 */

interface ClerkUserEvent {
  type: string;
  data: {
    id: string;
    username: string | null;
    image_url: string | null;
    email_addresses: Array<{ email_address: string; id: string }>;
    primary_email_address_id: string | null;
  };
}

export const registerClerkWebhook = (app: FastifyInstance): void => {
  app.post('/internal/webhooks/clerk', {
    config: {
      // Opt this route into rawBody capture (fastify-raw-body, global:false).
      rawBody: true,
    },
  }, async (request, reply) => {
    if (!env.CLERK_WEBHOOK_SECRET) {
      reply.status(503).send({ error: 'Webhook not configured', code: null });
      return;
    }

    const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);
    let event: ClerkUserEvent;
    try {
      event = wh.verify(
        request.rawBody as string,
        {
          'svix-id': String(request.headers['svix-id'] ?? ''),
          'svix-timestamp': String(request.headers['svix-timestamp'] ?? ''),
          'svix-signature': String(request.headers['svix-signature'] ?? ''),
        },
      ) as unknown as ClerkUserEvent;
    } catch {
      reply.status(400).send({ error: 'Invalid webhook signature', code: null });
      return;
    }

    const d = event.data;
    const primaryEmail = d.email_addresses.find(
      (e) => e.id === d.primary_email_address_id,
    )?.email_address;

    switch (event.type) {
      case 'user.created':
      case 'user.updated': {
        await db
          .insert(users)
          .values({
            id: d.id,
            username: d.username ?? `user_${d.id.slice(-6)}`,
            imageUrl: d.image_url,
            email: primaryEmail,
          })
          .onConflictDoUpdate({
            target: users.id,
            set: {
              username: d.username ?? `user_${d.id.slice(-6)}`,
              imageUrl: d.image_url,
              email: primaryEmail,
              updatedAt: new Date(),
            },
          });
        break;
      }
      case 'user.deleted': {
        await db.delete(users).where(eq(users.id, d.id));
        break;
      }
      default:
        // Unhandled event types are acked (200) so Clerk doesn't retry forever.
        break;
    }

    reply.status(200).send({ received: true });
  });
};
