import { isTrackId } from '@rheoson/shared';
import { FastifyInstance } from 'fastify';

import { requireUser } from '../auth/plugin.js';
import { badRequest } from '../errors.js';
import { prepareStream } from '../services/stream.service.js';
import { probeTrack, relayAvailable } from '../services/upstream.service.js';

/**
 * Playback routes — the paths that make a track audible.
 *
 * `/stream` is the byte path: a session is required like every other data
 * route, a `Range` header is forwarded untouched, and the response is piped
 * rather than buffered (a whole track in memory per listener is how a phone
 * dies).
 */
export const registerTrackRoutes = (app: FastifyInstance): void => {
  app.get<{ Params: { trackId: string } }>(
    '/api/tracks/:trackId/stream',
    async (request, reply) => {
      requireUser(request);
      const { trackId } = request.params;
      if (!isTrackId(trackId)) {
        throw badRequest('SVA03');
      }

      const range = request.headers.range;
      const prepared = await prepareStream(trackId, range);

      request.log.debug(
        { trackId: trackId, source: prepared.source, status: prepared.status, range: range ?? null },
        'stream prepared',
      );

      reply.code(prepared.status).headers(prepared.headers);
      return reply.send(prepared.body);
    },
  );

  app.get<{ Params: { trackId: string } }>(
    '/api/tracks/:trackId/info',
    async (request, reply) => {
      requireUser(request);
      const { trackId } = request.params;
      if (!isTrackId(trackId)) {
        throw badRequest('SVA03');
      }

      // Reported so a client can decide whether to pre-buffer: a healthy relay
      // means the first bytes are cheap, an absent one means they are not.
      const [probed, relay] = await Promise.all([probeTrack(trackId), relayAvailable()]);
      // A failed probe is not a failed track: the stream path would still
      // succeed, so degrade to a conservative answer instead of erroring.
      reply.send({
        mime: probed?.mime ?? 'audio/mpeg',
        bytes: probed?.bytes ?? null,
        relayAvailable: relay,
        probed: probed !== null,
      });
    },
  );
};
