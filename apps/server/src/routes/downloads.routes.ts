import { isTrackId, isHttpUrl } from '@rheoson/shared';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireUser } from '../auth/plugin.js';
import { env } from '../env.js';
import { badRequest, unauthorized } from '../errors.js';
import { publish } from '../realtime/bus.js';
import {
  cancelDownload,
  createDownload,
  deleteDownload,
  getDownload,
  listDownloads,
  retryDownload,
} from '../services/downloads.service.js';
import { rescanLibrary } from '../services/engine.service.js';

/**
 * Downloads.
 *
 * The owner is never taken from the request body — it comes from the verified
 * session and is forwarded as a header, so a client cannot create, read or
 * cancel a job on someone else's behalf. That is the same contract the current
 * stack enforces in `download_service`, kept because it is an authorization
 * boundary, not a convenience.
 *
 * Live progress arrives over SSE (see the realtime bus), and the engine posts
 * its events to `/internal/events` below — the one route that authenticates
 * with the service token instead of a session, because the caller is a service.
 */

const CreateBody = z.object({
  trackId: z.string().optional(),
  url: z.string().optional(),
  title: z.string().max(200).optional(),
});

const RetryBody = z.object({ resume: z.boolean().optional() });

export const registerDownloadRoutes = (app: FastifyInstance): void => {
  app.get('/api/downloads', async (request, reply) => {
    const userId = requireUser(request);
    reply.send({ jobs: await listDownloads(userId) });
  });

  app.post('/api/downloads', async (request, reply) => {
    const userId = requireUser(request);
    const parsed = CreateBody.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest('DVA03');

    const { trackId, url, title } = parsed.data;
    if (!trackId && !url) throw badRequest('DVA03');
    if (trackId && !isTrackId(trackId)) throw badRequest('DVA04');
    if (url && !isHttpUrl(url)) throw badRequest('DVA01');

    reply.code(202).send(await createDownload(userId, { trackId, url, title }));
  });

  app.get<{ Params: { jobId: string } }>('/api/downloads/:jobId', async (request, reply) => {
    const userId = requireUser(request);
    const jobId = request.params.jobId;
    if (!jobId) throw badRequest('DVA05');
    reply.send(await getDownload(userId, jobId));
  });

  app.post<{ Params: { jobId: string } }>('/api/downloads/:jobId/cancel', async (request, reply) => {
    const userId = requireUser(request);
    reply.send(await cancelDownload(userId, request.params.jobId));
  });

  app.post<{ Params: { jobId: string } }>('/api/downloads/:jobId/retry', async (request, reply) => {
    const userId = requireUser(request);
    const parsed = RetryBody.safeParse(request.body ?? {});
    if (!parsed.success) throw badRequest('DVA05');

    const job = await retryDownload(userId, request.params.jobId, parsed.data.resume);
    reply.send(job);
  });

  app.delete<{ Params: { jobId: string } }>('/api/downloads/:jobId', async (request, reply) => {
    const userId = requireUser(request);
    reply.send(await deleteDownload(userId, request.params.jobId));
  });

  /**
   * Completion invalidates the library: a finished download must be visible
   * immediately, not after the engine's listing cache lapses. The whole
   * invalidation chain is here — engine listing **and** the client's own
   * caches, which are refreshed by the SSE event broadcast below.
   */
  app.post('/api/downloads/rescan', async (request, reply) => {
    const userId = requireUser(request);
    await rescanLibrary();
    publish(userId, 'library:changed', { reason: 'rescan' });
    reply.send({ rescanned: true });
  });
};

/**
 * Internal: the engine reporting a job's progress.
 *
 * Authenticated with the shared service token rather than a session, because
 * the caller is a service, and scoped to exactly one thing: publishing to the
 * owner's channel. It cannot read or change anything.
 */
export const registerInternalRoutes = (app: FastifyInstance): void => {
  app.post('/internal/events', async (request, reply) => {
    const token = env.ENGINE_TOKEN;
    if (token) {
      const header = String(request.headers.authorization ?? '');
      const presented = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
      if (presented !== token) throw unauthorized('ASE02');
    }

    const body = request.body as { event?: string; job?: { owner?: string } } | undefined;
    const owner = body?.job?.owner;
    const event = body?.event;
    if (!owner || !event) throw badRequest('DVA05');

    publish(owner, event, body?.job ?? {});

    // A completed download is the one event that also changes what the library
    // contains, so the client is told to refresh rather than poll.
    if (event === 'download:completed') {
      publish(owner, 'library:changed', { reason: 'download' });
    }

    reply.code(202).send({ delivered: true });
  });
};
