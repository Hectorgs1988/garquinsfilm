import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { SeasonProgressBatchInput } from '@garquinsfilm/shared';
import { auth, type AuthRuntime } from '../auth/auth.js';
import { getAuthConfig } from '../auth/config.js';
import { getPrismaClient } from '../db/client.js';
import {
  PrismaSeasonProgressRepository,
  type SeasonProgressOutcome,
  type SeasonProgressRepository,
} from './season-progress.service.js';
import {
  SeasonProgressValidationError,
  parseSeasonNumberParam,
  validateSeasonProgressBatch,
  validateSeasonProgressEntryId,
} from './season-progress.validation.js';

interface SeasonProgressRoutesOptions {
  auth?: AuthRuntime;
  repository?: SeasonProgressRepository;
}

const entryParams = {
  type: 'object',
  required: ['entryId'],
  additionalProperties: false,
  properties: { entryId: { type: 'string', minLength: 1, maxLength: 128 } },
} as const;

const seasonParams = {
  type: 'object',
  required: ['entryId', 'seasonNumber'],
  additionalProperties: false,
  properties: {
    entryId: { type: 'string', minLength: 1, maxLength: 128 },
    seasonNumber: { type: 'string', minLength: 1, maxLength: 16 },
  },
} as const;

const noQuery = { type: 'object', additionalProperties: false } as const;

const seasonProgressRoutes: FastifyPluginAsync<SeasonProgressRoutesOptions> = async (
  app,
  options,
) => {
  const authInstance = options.auth ?? auth;
  const repository = options.repository ?? new PrismaSeasonProgressRepository(getPrismaClient());
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
    '/api/library/:entryId/seasons',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { params: entryParams, querystring: noQuery },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const entryId = validateSeasonProgressEntryId(request.params.entryId);
        const outcome = await repository.list(userId, entryId);
        return sendOutcome(reply, outcome, (view) => reply.code(200).send(view));
      } catch (error) {
        return handleError(request, reply, error);
      }
    },
  );

  app.put<{ Params: { entryId: string; seasonNumber: string } }>(
    '/api/library/:entryId/seasons/:seasonNumber',
    {
      bodyLimit: 1024,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { params: seasonParams, querystring: noQuery },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const entryId = validateSeasonProgressEntryId(request.params.entryId);
        const seasonNumber = parseSeasonNumberParam(request.params.seasonNumber);
        const outcome = await repository.complete(userId, entryId, seasonNumber);
        return sendOutcome(reply, outcome, (result) =>
          reply.code(result.created ? 201 : 200).send(result.season),
        );
      } catch (error) {
        return handleError(request, reply, error);
      }
    },
  );

  app.delete<{ Params: { entryId: string; seasonNumber: string } }>(
    '/api/library/:entryId/seasons/:seasonNumber',
    {
      bodyLimit: 1024,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { params: seasonParams, querystring: noQuery },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const entryId = validateSeasonProgressEntryId(request.params.entryId);
        const seasonNumber = parseSeasonNumberParam(request.params.seasonNumber);
        const outcome = await repository.uncomplete(userId, entryId, seasonNumber);
        return sendOutcome(reply, outcome, () => reply.code(204).send());
      } catch (error) {
        return handleError(request, reply, error);
      }
    },
  );

  app.patch<{ Params: { entryId: string }; Body: SeasonProgressBatchInput }>(
    '/api/library/:entryId/seasons',
    {
      bodyLimit: 4 * 1024,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: entryParams,
        querystring: noQuery,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            // Left untyped on purpose: Fastify's AJV would coerce a scalar into an array.
            // validateSeasonProgressBatch enforces the real shape strictly.
            complete: {},
            uncomplete: {},
          },
        },
      },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const entryId = validateSeasonProgressEntryId(request.params.entryId);
        const batch = validateSeasonProgressBatch(request.body);
        const outcome = await repository.applyBatch(userId, entryId, batch);
        return sendOutcome(reply, outcome, (view) => reply.code(200).send(view));
      } catch (error) {
        return handleError(request, reply, error);
      }
    },
  );
};

function sendOutcome<T>(
  reply: FastifyReply,
  outcome: SeasonProgressOutcome<T>,
  onOk: (value: T) => FastifyReply,
): FastifyReply {
  switch (outcome.kind) {
    case 'ok':
      return onOk(outcome.value);
    case 'not_found':
      return reply.code(404).send({ error: 'Library entry not found.' });
    case 'not_series':
      return reply.code(400).send({ error: 'Season progress is only available for series.' });
    case 'limit_reached':
      return reply.code(409).send({ error: 'The completed seasons limit has been reached.' });
  }
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
    logSafeError(request, error, 'Unable to verify season progress session.');
    reply.code(503).send({ error: 'Unable to verify session.' });
    return null;
  }
}

function handleError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof SeasonProgressValidationError) {
    return reply.code(400).send({ error: 'Invalid season progress request.' });
  }
  logSafeError(request, error, 'Unable to complete season progress request.');
  if (isDatabaseUnavailable(error)) {
    return reply.code(503).send({ error: 'Season progress storage is temporarily unavailable.' });
  }
  return reply.code(500).send({ error: 'Unable to complete season progress request.' });
}

function isDatabaseUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  // P2028: the transaction timed out, e.g. waiting too long for the entry row lock.
  return ['P1000', 'P1001', 'P1002', 'P1008', 'P1013', 'P1017', 'P2024', 'P2028'].includes(
    String(error.code),
  );
}

function logSafeError(request: FastifyRequest, error: unknown, message: string): void {
  request.log.error({ errorType: error instanceof Error ? error.name : 'UnknownError' }, message);
}

export default seasonProgressRoutes;
