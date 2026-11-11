import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { ProfileUpdateInput } from '@garquinsfilm/shared';
import { auth, type AuthRuntime } from '../auth/auth.js';
import { getAuthConfig } from '../auth/config.js';
import { getPrismaClient } from '../db/client.js';
import { PrismaProfileRepository, type ProfileRepository } from './profile.service.js';
import { ProfileValidationError, validateProfileUpdateInput } from './profile.validation.js';

interface ProfileRoutesOptions {
  auth?: AuthRuntime;
  repository?: ProfileRepository;
}

const PROFILE_PATH = '/api/me/profile';

const profileRoutes: FastifyPluginAsync<ProfileRoutesOptions> = async (app, options) => {
  const authInstance = options.auth ?? auth;
  const repository = options.repository ?? new PrismaProfileRepository(getPrismaClient());
  const trustedOrigins = new Set(getAuthConfig().trustedOrigins);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (!request.url.startsWith(PROFILE_PATH)) return;

    const origin = request.headers.origin;
    if (origin && !trustedOrigins.has(origin)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  });

  app.get(
    PROFILE_PATH,
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { querystring: { type: 'object', additionalProperties: false } },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const profile = await repository.find(userId);
        return profile
          ? reply.code(200).send(profile)
          : reply.code(404).send({ error: 'Profile not found.' });
      } catch (error) {
        return handleServiceError(request, reply, error);
      }
    },
  );

  app.patch<{ Body: ProfileUpdateInput }>(
    PROFILE_PATH,
    {
      bodyLimit: 8 * 1024,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        querystring: { type: 'object', additionalProperties: false },
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            // Límites holgados: la validación exacta (puntos de código, NFC) está en el servicio.
            name: { type: 'string', maxLength: 200 },
            bio: { type: ['string', 'null'], maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const input = validateProfileUpdateInput(request.body);
        const profile = await repository.update(userId, input);
        return profile
          ? reply.code(200).send(profile)
          : reply.code(404).send({ error: 'Profile not found.' });
      } catch (error) {
        if (error instanceof ProfileValidationError) {
          return reply.code(400).send({ error: 'Invalid profile input.' });
        }
        return handleServiceError(request, reply, error);
      }
    },
  );
};

async function requireUserId(
  request: FastifyRequest,
  reply: FastifyReply,
  authInstance: AuthRuntime,
): Promise<string | null> {
  try {
    const session = await authInstance.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      reply.code(401).send({ error: 'Unauthorized' });
      return null;
    }
    return session.user.id;
  } catch (error) {
    logSafeError(request, error, 'Unable to verify profile session.');
    reply.code(503).send({ error: 'Unable to verify session.' });
    return null;
  }
}

function handleServiceError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  logSafeError(request, error, 'Unable to complete profile request.');
  if (isDatabaseUnavailable(error)) {
    return reply.code(503).send({ error: 'Profile storage is temporarily unavailable.' });
  }
  return reply.code(500).send({ error: 'Unable to complete profile request.' });
}

function isDatabaseUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return ['P1000', 'P1001', 'P1002', 'P1008', 'P1013', 'P1017', 'P2024'].includes(
    String(error.code),
  );
}

function logSafeError(request: FastifyRequest, error: unknown, message: string): void {
  request.log.error({ errorType: error instanceof Error ? error.name : 'UnknownError' }, message);
}

export default profileRoutes;
