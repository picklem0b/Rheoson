import { clerkPlugin, getAuth } from '@clerk/fastify';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../env.js';
import { unauthorized } from '../errors.js';

/**
 * Clerk auth (ADR-1): every data route requires a session, exactly like the
 * current stack (guest mode was removed there and is not coming back).
 *
 * The plugin is registered once in main.ts; route handlers call
 * `requireUser(request)` to get the Clerk user id.
 */

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

const DEV_ALLOWLIST = ['dev_user_a', 'dev_user_b'];

export const registerAuth = (app: FastifyInstance): void => {
  if (env.CLERK_SECRET_KEY) {
    app.register(clerkPlugin);
    return;
  }

  // No Clerk key → development posture only. Mirrors Settings._DEV_ENVS:
  // anything that is not explicitly dev is treated as deployed and fails.
  if (!env.isDev) {
    throw new Error('CLERK_SECRET_KEY must be set outside development');
  }

  app.log.warn('CLERK_SECRET_KEY unset — dev auth stub active (allow-listed user ids only)');

  app.decorateRequest('userId', '');
  app.addHook('onRequest', async (request) => {
    const stub = request.headers['x-dev-user'];
    if (typeof stub === 'string' && DEV_ALLOWLIST.includes(stub)) {
      request.userId = stub;
    }
  });
};

/**
 * Guard for route handlers — throws 401 with the shared ASE01 code.
 * Works under both postures: the dev stub sets `request.userId` directly;
 * the real Clerk plugin fills auth context, read via getAuth.
 */
export function requireUser(request: FastifyRequest): string {
  if (request.userId) return request.userId;
  if (env.CLERK_SECRET_KEY) {
    const { userId } = getAuth(request);
    if (userId) return userId;
  }
  throw unauthorized('ASE01');
}
