import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type {
  LibraryCreateInput,
  LibraryUpdateInput,
  LibraryListQuery,
} from '@garquinsfilm/shared';
import { auth, type AuthRuntime } from '../auth/auth.js';
import { getAuthConfig } from '../auth/config.js';
import { getPrismaClient } from '../db/client.js';
import { createCatalogDetailService } from '../catalog/catalog.detail.js';
import { enrichEntries, toMediaSummary, type MediaSummaryLoader } from './library.enrich.js';
import {
  createLibraryService,
  LibraryDuplicateEntryError,
  LibraryUpdateConflictError,
  PrismaLibraryRepository,
  type LibraryRepository,
} from './library.service.js';
import {
  LibraryValidationError,
  validateCreateInput,
  validateEntryId,
  validateListQuery,
  validateUpdateInput,
} from './library.validation.js';

interface LibraryRoutesOptions {
  auth?: AuthRuntime;
  repository?: LibraryRepository;
  /** `null` sirve la biblioteca sin metadatos; omitirlo usa TMDB. */
  mediaLoader?: MediaSummaryLoader | null;
}

/**
 * Pide los títulos a TMDB reutilizando la caché del catálogo. Si falta configuración
 * deja de intentarlo: la biblioteca debe responder igual sin metadatos.
 */
function createTmdbSummaryLoader(app: FastifyInstance): MediaSummaryLoader {
  let detailService: ReturnType<typeof createCatalogDetailService> | null = null;
  let unavailable = false;

  return {
    async load(type, tmdbId) {
      if (unavailable) return null;
      try {
        detailService ??= createCatalogDetailService(app.tmdb.get());
      } catch {
        unavailable = true;
        return null;
      }
      return toMediaSummary(await detailService.getDetail({ type, tmdbId }));
    },
  };
}

const libraryRoutes: FastifyPluginAsync<LibraryRoutesOptions> = async (app, options) => {
  const authInstance = options.auth ?? auth;
  const repository = options.repository ?? new PrismaLibraryRepository(getPrismaClient());
  const service = createLibraryService(repository);
  const mediaLoader =
    options.mediaLoader === undefined ? createTmdbSummaryLoader(app) : options.mediaLoader;
  const trustedOrigins = new Set(getAuthConfig().trustedOrigins);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (!request.url.startsWith('/api/library')) {
      return;
    }

    const origin = request.headers.origin;
    if (origin && !trustedOrigins.has(origin)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  });

  app.post<{ Body: LibraryCreateInput }>(
    '/api/library',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            source: { type: 'string' },
            type: { type: 'string' },
            tmdbId: { type: 'integer' },
            status: { type: 'string' },
            isFavorite: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const input = validateCreateInput(request.body);
        const entry = await service.create(userId, input);
        const [enriched] = await enrichEntries([entry], mediaLoader);
        return reply.code(201).send(enriched ?? entry);
      } catch (error) {
        if (error instanceof LibraryValidationError) {
          return reply.code(400).send({ error: 'Invalid library entry.' });
        }
        if (error instanceof LibraryDuplicateEntryError) {
          return reply.code(409).send({ error: 'This title is already in your library.' });
        }
        return handleServiceError(request, reply, error, 'Unable to add library entry.');
      }
    },
  );

  app.get<{ Querystring: Partial<LibraryListQuery> }>(
    '/api/library',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string' },
            status: { type: 'string' },
            favorite: { type: 'string' },
            page: { type: 'string' },
            pageSize: { type: 'string' },
            sortBy: { type: 'string' },
            sortOrder: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const query = validateListQuery(request.query);
        const page = await service.list(userId, query);
        return reply
          .code(200)
          .send({ ...page, results: await enrichEntries(page.results, mediaLoader) });
      } catch (error) {
        if (error instanceof LibraryValidationError) {
          return reply.code(400).send({ error: 'Invalid library query.' });
        }
        return handleServiceError(request, reply, error, 'Unable to retrieve library.');
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/library/:id',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          additionalProperties: false,
          properties: { id: { type: 'string' } },
        },
        querystring: { type: 'object', additionalProperties: false },
      },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const id = validateEntryId(request.params.id);
        const entry = await service.find(userId, id);
        if (!entry) return reply.code(404).send({ error: 'Library entry not found.' });
        const [enriched] = await enrichEntries([entry], mediaLoader);
        return reply.code(200).send(enriched ?? entry);
      } catch (error) {
        if (error instanceof LibraryValidationError) {
          return reply.code(400).send({ error: 'Invalid library entry.' });
        }
        return handleServiceError(request, reply, error, 'Unable to retrieve library entry.');
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: LibraryUpdateInput }>(
    '/api/library/:id',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          additionalProperties: false,
          properties: { id: { type: 'string' } },
        },
        querystring: { type: 'object', additionalProperties: false },
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            status: { type: 'string' },
            isFavorite: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const id = validateEntryId(request.params.id);
        const input = validateUpdateInput(request.body);
        const entry = await service.update(userId, id, input);
        if (!entry) return reply.code(404).send({ error: 'Library entry not found.' });
        const [enriched] = await enrichEntries([entry], mediaLoader);
        return reply.code(200).send(enriched ?? entry);
      } catch (error) {
        if (error instanceof LibraryValidationError) {
          return reply.code(400).send({ error: 'Invalid library update.' });
        }
        if (error instanceof LibraryUpdateConflictError) {
          return reply.code(409).send({ error: 'The library entry changed; try again.' });
        }
        return handleServiceError(request, reply, error, 'Unable to update library entry.');
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/library/:id',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          additionalProperties: false,
          properties: { id: { type: 'string' } },
        },
        querystring: { type: 'object', additionalProperties: false },
      },
    },
    async (request, reply) => {
      const userId = await requireUserId(request, reply, authInstance);
      if (!userId) return reply;

      try {
        const id = validateEntryId(request.params.id);
        const deleted = await service.delete(userId, id);
        return deleted
          ? reply.code(204).send()
          : reply.code(404).send({ error: 'Library entry not found.' });
      } catch (error) {
        if (error instanceof LibraryValidationError) {
          return reply.code(400).send({ error: 'Invalid library entry.' });
        }
        return handleServiceError(request, reply, error, 'Unable to delete library entry.');
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
    logSafeError(request, error, 'Unable to verify library session.');
    reply.code(503).send({ error: 'Unable to verify session.' });
    return null;
  }
}

function handleServiceError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  message: string,
) {
  logSafeError(request, error, message);
  if (isDatabaseUnavailable(error)) {
    return reply.code(503).send({ error: 'Library storage is temporarily unavailable.' });
  }
  return reply.code(500).send({ error: 'Unable to complete library request.' });
}

function isDatabaseUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return ['P1000', 'P1001', 'P1002', 'P1008', 'P1013', 'P1017', 'P2024'].includes(
    String(error.code),
  );
}

function logSafeError(request: FastifyRequest, error: unknown, message: string): void {
  request.log.error({ errorType: error instanceof Error ? error.name : 'UnknownError' }, message);
}

export default libraryRoutes;
