import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  LIST_MAX_PER_USER,
  type MediaListCreateInput,
  type MediaListUpdateInput,
} from '@garquinsfilm/shared';
import { auth, type AuthRuntime } from '../auth/auth.js';
import { getAuthConfig } from '../auth/config.js';
import { getPrismaClient } from '../db/client.js';
import {
  ListLimitReachedError,
  ListUpdateConflictError,
  PrismaListRepository,
  type ListRepository,
} from './lists.service.js';
import {
  ListValidationError,
  validateListCreateInput,
  validateListId,
  validateListUpdateInput,
} from './lists.validation.js';

interface ListRoutesOptions {
  auth?: AuthRuntime;
  repository?: ListRepository;
}

const LISTS_PATH = '/api/lists';

const listsRoutes: FastifyPluginAsync<ListRoutesOptions> = async (app, options) => {
  const authInstance = options.auth ?? auth;
  const repository = options.repository ?? new PrismaListRepository(getPrismaClient());
  const trustedOrigins = new Set(getAuthConfig().trustedOrigins);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (!request.url.startsWith(LISTS_PATH)) return;

    const origin = request.headers.origin;
    if (origin && !trustedOrigins.has(origin)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  });

  app.get(
    LISTS_PATH,
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { querystring: { type: 'object', additionalProperties: false } },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        return reply.code(200).send({ results: await repository.list(userId) });
      } catch (error) {
        return handleServiceError(request, reply, error);
      }
    },
  );

  app.post<{ Body: MediaListCreateInput }>(
    LISTS_PATH,
    {
      bodyLimit: 8 * 1024,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        querystring: { type: 'object', additionalProperties: false },
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', maxLength: 400 },
            description: { type: ['string', 'null'], maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const input = validateListCreateInput(request.body);
        return reply.code(201).send(await repository.create(userId, input));
      } catch (error) {
        if (error instanceof ListValidationError) {
          return reply.code(400).send({ error: 'Invalid list.' });
        }
        if (error instanceof ListLimitReachedError) {
          return reply
            .code(409)
            .send({ error: `You cannot have more than ${LIST_MAX_PER_USER} lists.` });
        }
        return handleServiceError(request, reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    `${LISTS_PATH}/:id`,
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: { querystring: { type: 'object', additionalProperties: false } },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const id = validateListId(request.params.id);
        const list = await repository.find(userId, id);
        return list ? reply.code(200).send(list) : notFound(reply);
      } catch (error) {
        if (error instanceof ListValidationError) return notFound(reply);
        return handleServiceError(request, reply, error);
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: MediaListUpdateInput }>(
    `${LISTS_PATH}/:id`,
    {
      bodyLimit: 8 * 1024,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        querystring: { type: 'object', additionalProperties: false },
        body: {
          type: 'object',
          required: ['expectedUpdatedAt'],
          minProperties: 2,
          additionalProperties: false,
          properties: {
            name: { type: 'string', maxLength: 400 },
            description: { type: ['string', 'null'], maxLength: 2000 },
            expectedUpdatedAt: { type: 'string', maxLength: 64 },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const id = validateListId(request.params.id);
        const input = validateListUpdateInput(request.body);
        const list = await repository.update(userId, id, input);
        return list ? reply.code(200).send(list) : notFound(reply);
      } catch (error) {
        if (error instanceof ListValidationError) {
          return reply.code(400).send({ error: 'Invalid list update.' });
        }
        if (error instanceof ListUpdateConflictError) {
          return reply.code(409).send({ error: 'The list changed; try again.' });
        }
        return handleServiceError(request, reply, error);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    `${LISTS_PATH}/:id`,
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { querystring: { type: 'object', additionalProperties: false } },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const id = validateListId(request.params.id);
        return (await repository.delete(userId, id)) ? reply.code(204).send() : notFound(reply);
      } catch (error) {
        if (error instanceof ListValidationError) return notFound(reply);
        return handleServiceError(request, reply, error);
      }
    },
  );
};

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ error: 'List not found.' });
}

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
    logSafeError(request, error, 'Unable to verify list session.');
    reply.code(503).send({ error: 'Unable to verify session.' });
    return null;
  }
}

function handleServiceError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  logSafeError(request, error, 'Unable to complete list request.');
  if (isDatabaseUnavailable(error)) {
    return reply.code(503).send({ error: 'Lists are temporarily unavailable.' });
  }
  return reply.code(500).send({ error: 'Unable to complete list request.' });
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

export default listsRoutes;
