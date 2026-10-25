import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

import type { AuthRuntime } from '../auth/auth.js';
import type { TmdbClient } from './tmdb.client.js';
import { createTmdbClientProvider } from './tmdb.provider.js';
import catalogRoutes from './catalog.routes.js';
import rateLimit from '@fastify/rate-limit';
import { SEARCH_CACHE_TTL_MS } from './catalog.cache.js';
import {
  TmdbTimeoutError,
  TmdbUnavailableError,
  TmdbInvalidResponseError,
  TmdbRateLimitError,
} from './tmdb.errors.js';

describe('GET /api/search', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function createTestApp(
    options: {
      authenticated?: boolean;
      response?: unknown;
      error?: Error;
    } = {},
  ) {
    const getSession = vi
      .fn()
      .mockResolvedValue(
        options.authenticated ? { user: { id: 'test-user', role: 'user' } } : null,
      );

    const getJson = vi.fn().mockImplementation(async () => {
      if (options.error) throw options.error;

      return (
        options.response ?? {
          page: 1,
          total_pages: 1,
          total_results: 1,
          results: [
            {
              id: 603,
              title: 'Matrix',
              original_title: 'The Matrix',
              release_date: '1999-03-31',
            },
          ],
        }
      );
    });

    const client: TmdbClient = {
      language: 'es-ES',
      region: 'ES',
      getJson,
    };

    const auth = {
      api: { getSession },
    } as unknown as AuthRuntime;

    const app = Fastify();

    app.decorate('tmdb', createTmdbClientProvider({ client }));

    app.register(catalogRoutes, { auth });
    apps.push(app);

    return { app, getSession, getJson };
  }

  it('rechaza solicitudes sin sesión', async () => {
    const { app, getJson } = createTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/search?q=Matrix',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
    expect(getJson).not.toHaveBeenCalled();
  });

  it('devuelve resultados normalizados con sesión válida', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/search?q=Matrix&type=movie',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [
        {
          source: 'tmdb',
          type: 'movie',
          tmdbId: 603,
          title: 'Matrix',
          originalTitle: 'The Matrix',
          year: 1999,
        },
      ],
    });

    expect(getJson).toHaveBeenCalledOnce();
  });

  it('rechaza parámetros inválidos sin llamar a TMDB', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/search?q=%20%20&type=movie',
    });

    expect(response.statusCode).toBe(400);
    expect(getJson).not.toHaveBeenCalled();
  });

  it('devuelve 503 cuando TMDB está indisponible', async () => {
    const { app } = createTestApp({
      authenticated: true,
      error: new TmdbUnavailableError(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/search?q=Matrix',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: 'El catálogo no está disponible temporalmente.',
    });
  });

  it('devuelve 504 cuando TMDB agota el tiempo', async () => {
    const { app } = createTestApp({
      authenticated: true,
      error: new TmdbTimeoutError(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/search?q=Matrix',
    });

    expect(response.statusCode).toBe(504);
  });

  it('devuelve 502 cuando TMDB responde con datos inválidos', async () => {
    const { app } = createTestApp({
      authenticated: true,
      error: new TmdbInvalidResponseError(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/search?q=Matrix',
    });

    expect(response.statusCode).toBe(502);
  });

  it('devuelve 429 y Retry-After cuando TMDB limita las peticiones', async () => {
    const { app } = createTestApp({
      authenticated: true,
      error: new TmdbRateLimitError(2),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/search?q=Matrix',
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('2');
  });

  it('devuelve 503 si falla la comprobación de sesión', async () => {
    const { app, getSession, getJson } = createTestApp({
      authenticated: true,
    });

    getSession.mockRejectedValueOnce(new Error('Database unavailable'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/search?q=Matrix',
    });

    expect(response.statusCode).toBe(503);
    expect(getJson).not.toHaveBeenCalled();
    expect(response.body).not.toContain('Database unavailable');
  });

  it('limita las búsquedas a 30 solicitudes por minuto', async () => {
    const getSession = vi.fn().mockResolvedValue({
      user: { id: 'test-user', role: 'user' },
    });

    const getJson = vi.fn().mockResolvedValue({
      page: 1,
      total_pages: 0,
      total_results: 0,
      results: [],
    });

    const client: TmdbClient = {
      language: 'es-ES',
      region: 'ES',
      getJson,
    };

    const auth = {
      api: { getSession },
    } as unknown as AuthRuntime;

    const app = Fastify();

    // Igual que en buildApp: rate limiting por IP.
    await app.register(rateLimit, {
      global: false,
      keyGenerator: (request) => request.ip,
    });

    app.decorate('tmdb', createTmdbClientProvider({ client }));

    await app.register(catalogRoutes, { auth });
    apps.push(app);

    const statuses: number[] = [];

    for (let i = 0; i < 31; i += 1) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=Matrix',
      });

      statuses.push(response.statusCode);
    }

    expect(statuses.slice(0, 30)).toEqual(Array(30).fill(200));

    expect(statuses[30]).toBe(429);
    expect(getJson).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledTimes(30);
  });

  it('reutiliza la caché entre peticiones HTTP idénticas', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    const first = await app.inject({
      method: 'GET',
      url: '/api/search?q=Matrix&type=movie',
    });

    const second = await app.inject({
      method: 'GET',
      url: '/api/search?q=Matrix&type=movie',
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());

    // La segunda petición no consulta TMDB.
    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it('mantiene entradas independientes para consultas y tipos diferentes', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    const urls = [
      '/api/search?q=Matrix&type=movie',
      '/api/search?q=Matrix&type=tv',
      '/api/search?q=Dune&type=movie',
      '/api/search?q=Matrix&type=movie&page=2',
    ];

    for (const url of urls) {
      const response = await app.inject({
        method: 'GET',
        url,
      });

      expect(response.statusCode).toBe(200);
    }

    expect(getJson).toHaveBeenCalledTimes(4);

    // La primera combinación ya está almacenada.
    const repeated = await app.inject({
      method: 'GET',
      url: urls[0]!,
    });

    expect(repeated.statusCode).toBe(200);
    expect(getJson).toHaveBeenCalledTimes(4);
  });

  it('comparte una consulta TMDB entre peticiones HTTP simultáneas', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    let resolveSearch!: (value: unknown) => void;

    getJson.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );

    const first = app.inject({
      method: 'GET',
      url: '/api/search?q=Matrix&type=movie',
    });

    const second = app.inject({
      method: 'GET',
      url: '/api/search?q=Matrix&type=movie',
    });

    // Esperamos a que Fastify haya iniciado la llamada simulada.
    await vi.waitFor(() => {
      expect(getJson).toHaveBeenCalledTimes(1);
    });

    resolveSearch({
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [
        {
          id: 603,
          title: 'Matrix',
          original_title: 'The Matrix',
          release_date: '1999-03-31',
        },
      ],
    });

    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(firstResponse.json()).toEqual(secondResponse.json());

    // Ambas peticiones comparten una única operación.
    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it('consulta de nuevo TMDB cuando caduca la caché HTTP', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    // Simulamos el paso del tiempo sin esperar cinco minutos.
    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now');

    try {
      dateNow.mockReturnValue(now);

      const first = await app.inject({
        method: 'GET',
        url: '/api/search?q=Matrix&type=movie',
      });

      expect(first.statusCode).toBe(200);
      expect(getJson).toHaveBeenCalledTimes(1);

      // Todavía está dentro del TTL.
      dateNow.mockReturnValue(now + SEARCH_CACHE_TTL_MS - 1);

      const second = await app.inject({
        method: 'GET',
        url: '/api/search?q=Matrix&type=movie',
      });

      expect(second.statusCode).toBe(200);
      expect(getJson).toHaveBeenCalledTimes(1);

      // La caché acaba de caducar.
      dateNow.mockReturnValue(now + SEARCH_CACHE_TTL_MS);

      const third = await app.inject({
        method: 'GET',
        url: '/api/search?q=Matrix&type=movie',
      });

      expect(third.statusCode).toBe(200);
      expect(getJson).toHaveBeenCalledTimes(2);
    } finally {
      dateNow.mockRestore();
    }
  });

  it('no devuelve datos caducados cuando TMDB falla', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now');

    try {
      dateNow.mockReturnValue(now);

      // Primera consulta: TMDB responde correctamente.
      const first = await app.inject({
        method: 'GET',
        url: '/api/search?q=Matrix&type=movie',
      });

      expect(first.statusCode).toBe(200);
      expect(getJson).toHaveBeenCalledTimes(1);

      // Caduca la caché.
      dateNow.mockReturnValue(now + SEARCH_CACHE_TTL_MS + 1);

      // TMDB deja de estar disponible.
      getJson.mockRejectedValueOnce(new TmdbUnavailableError());

      const second = await app.inject({
        method: 'GET',
        url: '/api/search?q=Matrix&type=movie',
      });

      expect(second.statusCode).toBe(503);
      expect(second.json()).not.toEqual(first.json());
      expect(getJson).toHaveBeenCalledTimes(2);

      // El error no debe almacenarse en caché.
      const third = await app.inject({
        method: 'GET',
        url: '/api/search?q=Matrix&type=movie',
      });

      expect(third.statusCode).toBe(200);
      expect(getJson).toHaveBeenCalledTimes(3);
    } finally {
      dateNow.mockRestore();
    }
  });

  it('devuelve 503 cuando se alcanza el límite de búsquedas simultáneas', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    const resolvers: Array<(value: unknown) => void> = [];

    getJson.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const pendingRequests = Array.from({ length: 20 }, (_, index) =>
      app.inject({
        method: 'GET',
        url: `/api/search?q=film${index}&type=movie`,
      }),
    );

    try {
      await vi.waitFor(() => {
        expect(getJson).toHaveBeenCalledTimes(20);
      });

      const overloaded = await app.inject({
        method: 'GET',
        url: '/api/search?q=extra&type=movie',
      });

      expect(overloaded.statusCode).toBe(503);
      expect(overloaded.headers['retry-after']).toBe('1');
      expect(overloaded.json()).toEqual({
        error: 'La capacidad de búsqueda del catálogo se ha excedido.',
      });

      expect(getJson).toHaveBeenCalledTimes(20);
    } finally {
      const tmdbResponse = {
        page: 1,
        total_pages: 0,
        total_results: 0,
        results: [],
      };

      for (const resolve of resolvers) {
        resolve(tmdbResponse);
      }

      await Promise.all(pendingRequests);
    }
  });
});
