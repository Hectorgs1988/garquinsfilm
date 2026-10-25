import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyPluginAsync } from 'fastify';
import type { MediaSearchResponse } from '@garquinsfilm/shared';

import { auth, type AuthRuntime } from '../auth/auth.js';
import { CatalogCache, CatalogCacheBusyError } from './catalog.cache.js';
import { createCatalogSearchService } from './catalog.search.js';
import { CatalogValidationError, validateSearchParams } from './catalog.validation.js';
import { TmdbError, toCatalogHttpError } from './tmdb.errors.js';

interface CatalogRoutesOptions {
  auth?: AuthRuntime;
}

const catalogRoutes: FastifyPluginAsync<CatalogRoutesOptions> = async (app, options) => {
  const authInstance = options.auth ?? auth;

  // Una única caché por instancia de Fastify.
  const cache = new CatalogCache<MediaSearchResponse>();

  // Inicialización diferida para no acceder a TMDB
  // antes de validar la sesión y los parámetros.
  let searchService: ReturnType<typeof createCatalogSearchService> | undefined;

  function getSearchService() {
    searchService ??= createCatalogSearchService(app.tmdb.get(), { cache });

    return searchService;
  }

  app.get(
    '/api/search',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      // 1. Verificar la sesión mediante Better Auth.
      try {
        const session = await authInstance.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });

        if (!session) {
          return reply.code(401).send({
            error: 'Unauthorized',
          });
        }
      } catch (error) {
        request.log.error(
          {
            errorType: error instanceof Error ? error.name : 'UnknownError',
          },
          'Catalog session verification failed.',
        );

        return reply.code(503).send({
          error: 'No se pudo verificar la sesión.',
        });
      }

      // 2. Validar los parámetros de búsqueda.
      let params;

      try {
        params = validateSearchParams(request.query);
      } catch (error) {
        if (error instanceof CatalogValidationError) {
          return reply.code(400).send({
            error: error.message,
          });
        }

        throw error;
      }

      // 3. Buscar usando el servicio compartido y su caché.
      try {
        const result = await getSearchService().search(params);

        return reply.code(200).send(result);
      } catch (error) {
        if (error instanceof CatalogCacheBusyError) {
          reply.header('Retry-After', '1'); // Indicar al cliente que reintente después de 1 segundo.
          return reply.code(503).send({
            error: 'La capacidad de búsqueda del catálogo se ha excedido.',
          });
        }

        if (error instanceof TmdbError) {
          const mapped = toCatalogHttpError(error);

          if (mapped.retryAfterSeconds !== undefined) {
            reply.header('Retry-After', String(mapped.retryAfterSeconds));
          }

          return reply.code(mapped.statusCode).send(mapped.body);
        }

        request.log.error(
          {
            errorType: error instanceof Error ? error.name : 'UnknownError',
          },
          'Catalog search failed.',
        );

        return reply.code(503).send({
          error: 'El catálogo no está disponible temporalmente.',
        });
      }
    },
  );
};

export default catalogRoutes;
