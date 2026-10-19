import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { getPrismaClient } from '../db/client.js';
import { auth } from './auth.js';
import {
  acceptInvitation,
  ActiveInvitationExistsError,
  createInvitation,
  InvitationActivationConflictError,
  InvitationActivationUnavailableError,
  InvitationDeliveryUnavailableError,
  InvalidInvitationInputError,
  InvalidInvitationError,
  normalizeEmail,
  revokeInvitation,
  unavailableInvitationDelivery,
  type InvitationDelivery,
} from './invitations.service.js';
import { hasAdminRole } from './roles.js';
import { getAuthConfig } from './config.js';

interface InvitationRoutesOptions {
  delivery?: InvitationDelivery;
  prisma?: PrismaClient;
}

interface InvitationRequestBody {
  email: string;
}

interface AcceptInvitationBody {
  email: string;
  name: string;
  password: string;
  token: string;
}

const invitationRoutes: FastifyPluginAsync<InvitationRoutesOptions> = async (app, options) => {
  const config = getAuthConfig();
  const trustedOrigins = new Set(config.trustedOrigins);
  const prisma = options.prisma ?? getPrismaClient();
  const delivery = options.delivery ?? unavailableInvitationDelivery;

  app.addHook('onRequest', async (request, reply) => {
    const isInvitationRoute =
      request.url.startsWith('/api/admin/invitations') ||
      request.url.startsWith('/api/invitations/accept');
    if (!isInvitationRoute) {
      return;
    }

    const origin = request.headers.origin;
    if (
      (request.method !== 'GET' && (!origin || !trustedOrigins.has(origin))) ||
      (origin && !trustedOrigins.has(origin))
    ) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  });

  app.post<{ Body: InvitationRequestBody }>(
    '/api/admin/invitations',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', minLength: 3, maxLength: 320 },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await getSession(request);
      if (!session) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      if (!hasAdminRole(session.user.role)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      try {
        const invitation = await createInvitation(
          prisma,
          { email: normalizeEmail(request.body.email), createdByUserId: session.user.id },
          delivery,
        );
        return reply.code(201).send({ invitation });
      } catch (error) {
        if (error instanceof ActiveInvitationExistsError) {
          return reply.code(409).send({ error: 'An active invitation already exists.' });
        }
        if (error instanceof InvalidInvitationInputError) {
          return reply.code(400).send({ error: 'A valid email address is required.' });
        }
        if (error instanceof InvitationDeliveryUnavailableError) {
          logSafeError(request, error, 'Invitation delivery unavailable.');
          return reply.code(503).send({ error: 'Invitation delivery is temporarily unavailable.' });
        }
        if (
          error instanceof InvitationActivationConflictError ||
          error instanceof InvitationActivationUnavailableError
        ) {
          logSafeError(request, error, 'Invitation remains inactive after delivery.');
          return reply.code(503).send({ error: 'Invitation delivery is temporarily unavailable.' });
        }
        logSafeError(request, error, 'Unable to create invitation.');
        return reply.code(500).send({ error: 'Unable to create invitation.' });
      }
    },
  );

  app.get<{ Querystring: { limit?: number } }>(
    '/api/admin/invitations',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } },
        },
      },
    },
    async (request, reply) => {
      const session = await getSession(request);
      if (!session) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      if (!hasAdminRole(session.user.role)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const invitations = await prisma.invitation.findMany({
        orderBy: { createdAt: 'desc' },
        take: request.query.limit ?? 50,
        select: {
          id: true,
          email: true,
          createdAt: true,
          expiresAt: true,
          consumedAt: true,
          revokedAt: true,
          status: true,
          createdByUserId: true,
          consumedUserId: true,
        },
      });
      return { invitations };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/invitations/:id',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          additionalProperties: false,
          properties: { id: { type: 'string', minLength: 1, maxLength: 128 } },
        },
      },
    },
    async (request, reply) => {
      const session = await getSession(request);
      if (!session) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      if (!hasAdminRole(session.user.role)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      const revoked = await revokeInvitation(prisma, {
        id: request.params.id,
        actorUserId: session.user.id,
      });
      return revoked
        ? reply.code(204).send()
        : reply.code(404).send({ error: 'Invitation not found.' });
    },
  );

  app.post<{ Body: AcceptInvitationBody }>(
    '/api/invitations/accept',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['email', 'name', 'password', 'token'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', minLength: 3, maxLength: 320 },
            name: { type: 'string', minLength: 1, maxLength: 128 },
            password: { type: 'string', minLength: 12, maxLength: 128 },
            token: { type: 'string', minLength: 32, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await acceptInvitation(prisma, {
          email: request.body.email,
          name: request.body.name,
          password: request.body.password,
          token: request.body.token,
        });
        return reply.code(201).send({ user });
      } catch (error) {
        if (error instanceof InvalidInvitationError) {
          return reply.code(400).send({ error: 'Invitation is invalid or no longer available.' });
        }
        if (error instanceof InvalidInvitationInputError) {
          return reply.code(400).send({ error: 'Invitation is invalid or no longer available.' });
        }
        logSafeError(request, error, 'Unable to accept invitation.');
        return reply.code(500).send({ error: 'Unable to accept invitation.' });
      }
    },
  );
};

async function getSession(request: FastifyRequest) {
  try {
    return await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  } catch (error) {
    logSafeError(request, error, 'Unable to verify authentication session.');
    return null;
  }
}

function logSafeError(request: FastifyRequest, error: unknown, message: string): void {
  request.log.error({ errorType: error instanceof Error ? error.name : 'UnknownError' }, message);
}

export default invitationRoutes;
