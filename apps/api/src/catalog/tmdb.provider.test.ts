import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_PAGE_MAX, SEARCH_TYPES } from '@garquinsfilm/shared';
import type { MediaIdentity, MediaSearchResponse, ApiErrorBody } from '@garquinsfilm/shared';
import { buildApp } from '../app.js';
import type { DatabaseHealth } from '../db/database.js';
import { createTmdbClient } from './tmdb.client.js';
import { TmdbConfigError, toCatalogHttpError } from './tmdb.errors.js';
import type { TmdbError } from './tmdb.errors.js';
import { createTmdbClientProvider } from './tmdb.provider.js';

const database: DatabaseHealth = {
  check: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
};

describe('consumo de @garquinsfilm/shared desde la API (NodeNext)', () => {
  it('resuelve valores y tipos del paquete compilado', () => {
    const identity: MediaIdentity = { source: 'tmdb', type: 'movie', tmdbId: 603 };
    const page: MediaSearchResponse = { page: 1, totalPages: 1, totalResults: 0, results: [] };
    const body: ApiErrorBody = toCatalogHttpError({ kind: 'not_found' } as TmdbError).body;

    expect(identity.source).toBe('tmdb');
    expect(page.results).toEqual([]);
    expect(body.error).toEqual(expect.any(String));
    expect(SEARCH_TYPES).toEqual(['movie', 'tv', 'all']);
    expect(SEARCH_PAGE_MAX).toBe(500);
  });
});

describe('proveedor del cliente TMDB', () => {
  it('no exige el token hasta que se usa el catálogo', () => {
    const provider = createTmdbClientProvider({ environment: {} });

    expect(() => provider.get()).toThrow(TmdbConfigError);
  });

  it('crea el cliente una sola vez a partir del entorno', () => {
    const provider = createTmdbClientProvider({
      environment: { TMDB_READ_ACCESS_TOKEN: 'fixture-token', TMDB_TIMEOUT_MS: '2000' },
    });

    expect(provider.get()).toBe(provider.get());
    expect(provider.get().language).toBe('es-ES');
  });

  it('prefiere el cliente inyectado y no lee el entorno', () => {
    const injected = createTmdbClient({
      config: { readAccessToken: 't', timeoutMs: 1000, language: 'es-ES', region: 'ES' },
      fetch: vi.fn(),
    });

    expect(createTmdbClientProvider({ client: injected, environment: {} }).get()).toBe(injected);
  });
});

describe('buildApp con el catálogo', () => {
  let app: ReturnType<typeof buildApp> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('arranca y responde /health sin TMDB_READ_ACCESS_TOKEN', async () => {
    const original = process.env.TMDB_READ_ACCESS_TOKEN;
    delete process.env.TMDB_READ_ACCESS_TOKEN;
    try {
      app = buildApp({ database });

      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(() => app!.tmdb.get()).toThrow(TmdbConfigError);
    } finally {
      if (original !== undefined) process.env.TMDB_READ_ACCESS_TOKEN = original;
    }
  });

  it('permite inyectar un cliente simulado y no registra rutas de catálogo', async () => {
    const getJson = vi.fn().mockResolvedValue({});
    const tmdbClient = { language: 'es-ES', region: 'ES', getJson };
    app = buildApp({ database, tmdbClient });
    const searchResponse = await app.inject({
      method: 'GET',
      url: '/api/search?q=matrix',
    });

    // La ruta existe, pero requiere autenticación.
    expect(searchResponse.statusCode).toBe(401);

    expect(app.tmdb.get()).toBe(tmdbClient);
    for (const url of ['/api/media/movie/603', '/api/media/tv/1396']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(404);
    }
    expect(getJson).not.toHaveBeenCalled();
  });
});
