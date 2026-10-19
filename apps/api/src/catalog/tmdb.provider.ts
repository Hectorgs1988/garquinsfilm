import type { TmdbClient } from './tmdb.client.js';
import { createTmdbClient } from './tmdb.client.js';
import { getTmdbConfig } from './tmdb.config.js';
import type { TmdbEnvironment } from './tmdb.config.js';
import type { TmdbLogger } from './tmdb.client.js';

/**
 * Acceso perezoso al cliente TMDB. La configuración solo se lee y valida en la primera
 * llamada a `get()`: sin catálogo activo no se exige el token y la API arranca igual.
 */
export interface TmdbClientProvider {
  get(): TmdbClient;
}

export interface TmdbClientProviderOptions {
  /** Cliente ya construido (tests con transporte simulado). */
  client?: TmdbClient;
  environment?: TmdbEnvironment;
  logger?: TmdbLogger;
}

export function createTmdbClientProvider(
  options: TmdbClientProviderOptions = {},
): TmdbClientProvider {
  let client = options.client;

  return {
    get() {
      client ??= createTmdbClient({
        config: getTmdbConfig(options.environment ?? process.env),
        logger: options.logger,
      });
      return client;
    },
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    tmdb: TmdbClientProvider;
  }
}
