import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { RatingPutInput } from '@garquinsfilm/shared';
import { auth, type AuthRuntime } from '../auth/auth.js';
import { getAuthConfig } from '../auth/config.js';
import { getPrismaClient } from '../db/client.js';
import {
  PrismaRatingRepository,
  RatingConflictError,
  type RatingRepository,
} from './ratings.service.js';
import {
  RatingValidationError,
  validateRatingEntryId,
  validateRatingPutInput,
} from './ratings.validation.js';

interface RatingRoutesOptions {
  auth?: AuthRuntime;
  repository?: RatingRepository;
}

const ratingRoutes: FastifyPluginAsync<RatingRoutesOptions> = async (app, options) => {
  const authInstance = options.auth ?? auth;
  const repository = options.repository ?? new PrismaRatingRepository(getPrismaClient());
  const trustedOrigins = new Set(getAuthConfig().trustedOrigins);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (!request.url.startsWith('/api/library/')) return;

    const origin = request.headers.origin;
    if (origin && !trustedOrigins.has(origin)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  });

  app.get<{ Params: { entryId: string } }>(
    '/api/library/:entryId/rating',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        params: {
          type: 'object',
          required: ['entryId'],
          additionalProperties: false,
          properties: { entryId: { type: 'string', minLength: 1, maxLength: 128 } },
        },
        querystring: { type: 'object', additionalProperties: false },
      },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const entryId = validateRatingEntryId(request.params.entryId);
        const result = await repository.find(userId, entryId);
        return result.entryExists
          ? reply.code(200).send(result.rating)
          : reply.code(404).send({ error: 'Library entry not found.' });
      } catch (error) {
        if (error instanceof RatingValidationError) {
          return reply.code(400).send({ error: 'Invalid rating request.' });
        }
        return handleServiceError(request, reply, error);
      }
    },
  );

  app.put<{ Params: { entryId: string }; Body: RatingPutInput }>(
    '/api/library/:entryId/rating',
    {
      bodyLimit: 16 * 1024,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: {
          type: 'object',
          required: ['entryId'],
          additionalProperties: false,
          properties: { entryId: { type: 'string', minLength: 1, maxLength: 128 } },
        },
        querystring: { type: 'object', additionalProperties: false },
        body: {
          type: 'object',
          required: ['score', 'review', 'containsSpoilers'],
          additionalProperties: false,
          properties: {
            score: { type: ['number', 'null'] },
            review: { type: ['string', 'null'] },
            containsSpoilers: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const entryId = validateRatingEntryId(request.params.entryId);
        const input = validateRatingPutInput(request.body);
        const result = await repository.set(userId, entryId, input);
        if (!result) return reply.code(404).send({ error: 'Library entry not found.' });
        return reply.code(result.created ? 201 : 200).send(result.rating);
      } catch (error) {
        if (error instanceof RatingValidationError) {
          return reply.code(400).send({ error: 'Invalid rating input.' });
        }
        if (error instanceof RatingConflictError) {
          return reply.code(409).send({ error: 'The rating changed; try again.' });
        }
        return handleServiceError(request, reply, error);
      }
    },
  );

  app.delete<{ Params: { entryId: string } }>(
    '/api/library/:entryId/rating',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: {
          type: 'object',
          required: ['entryId'],
          additionalProperties: false,
          properties: { entryId: { type: 'string', minLength: 1, maxLength: 128 } },
        },
        querystring: { type: 'object', additionalProperties: false },
      },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const entryId = validateRatingEntryId(request.params.entryId);
        const deleted = await repository.delete(userId, entryId);
        return deleted
          ? reply.code(204).send()
          : reply.code(404).send({ error: 'Library entry not found.' });
      } catch (error) {
        if (error instanceof RatingValidationError) {
          return reply.code(400).send({ error: 'Invalid rating request.' });
        }
        if (error instanceof RatingConflictError) {
          return reply.code(409).send({ error: 'The rating changed; try again.' });
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
    logSafeError(request, error, 'Unable to verify rating session.');
    reply.code(503).send({ error: 'Unable to verify session.' });
    return null;
  }
}

function handleServiceError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  logSafeError(request, error, 'Unable to complete rating request.');
  if (isDatabaseUnavailable(error)) {
    return reply.code(503).send({ error: 'Rating storage is temporarily unavailable.' });
  }
  return reply.code(500).send({ error: 'Unable to complete rating request.' });
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

export default ratingRoutes;
