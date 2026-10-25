import type { AuthRuntime } from '../auth/auth.js';
import type { TmdbClient } from './tmdb.client.js';

import catalogRoutes from './catalog.routes.js';
import { createTmdbClientProvider } from './tmdb.provider.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import {
  TmdbNotFoundError,
  TmdbRateLimitError,
  TmdbInvalidResponseError,
  TmdbUnavailableError,
  TmdbTimeoutError,
} from './tmdb.errors.js';
import { SEARCH_CACHE_TTL_MS } from './catalog.cache.js';

describe('GET /api/media/:type/:tmdbId', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function createTestApp(
    options: {
      authenticated?: boolean;
      response?: unknown;
    } = {},
  ) {
    const getSession = vi
      .fn()
      .mockResolvedValue(
        options.authenticated ? { user: { id: 'test-user', role: 'user' } } : null,
      );

    const getJson = vi.fn().mockResolvedValue(
      options.response ?? {
        id: 603,
        title: 'Matrix',
        original_title: 'The Matrix',
        release_date: '1999-03-31',
        runtime: 136,
        genres: [{ id: 878, name: 'Ciencia ficción' }],
      },
    );

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

  it('devuelve 401 cuando no existe sesión', async () => {
    const { app, getJson } = createTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/media/movie/603',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthorized' });
    expect(getJson).not.toHaveBeenCalled();
  });

  it('devuelve el detalle normalizado de una película', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/media/movie/603',
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toMatchObject({
      source: 'tmdb',
      type: 'movie',
      tmdbId: 603,
      title: 'Matrix',
      year: 1999,
      runtime: 136,
      genres: [{ id: 878, name: 'Ciencia ficción' }],
    });

    expect(getJson).toHaveBeenCalledExactlyOnceWith(['movie', 603], {
      language: 'es-ES',
      append_to_response: 'credits,videos,watch/providers',
    });
  });

  it('devuelve el detalle normalizado de una serie', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
      response: {
        id: 1396,
        name: 'Breaking Bad',
        original_name: 'Breaking Bad',
        first_air_date: '2008-01-20',
        number_of_seasons: 5,
        number_of_episodes: 62,
        seasons: [
          {
            season_number: 0,
            episode_count: 4,
            name: 'Especiales',
          },
          {
            season_number: 1,
            episode_count: 7,
            name: 'Temporada 1',
          },
        ],
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/media/tv/1396',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      type: 'tv',
      tmdbId: 1396,
      title: 'Breaking Bad',
      numberOfSeasons: 5,
      numberOfEpisodes: 62,
      seasons: [
        { seasonNumber: 0, isSpecial: true },
        { seasonNumber: 1, isSpecial: false },
      ],
    });

    expect(getJson).toHaveBeenCalledExactlyOnceWith(['tv', 1396], {
      language: 'es-ES',
      append_to_response: 'credits,videos,watch/providers',
    });
  });

  it.each([
    '/api/media/person/603',
    '/api/media/movie/0',
    '/api/media/movie/-1',
    '/api/media/movie/abc',
    '/api/media/movie/1.5',
    '/api/media/tv/001',
  ])('rechaza parámetros inválidos: %s', async (url) => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    const response = await app.inject({
      method: 'GET',
      url,
    });

    expect(response.statusCode).toBe(400);
    expect(getJson).not.toHaveBeenCalled();
  });

  it('reutiliza la caché entre peticiones HTTP', async () => {
    const { app, getJson, getSession } = createTestApp({
      authenticated: true,
    });

    const first = await app.inject({
      method: 'GET',
      url: '/api/media/movie/603',
    });

    const second = await app.inject({
      method: 'GET',
      url: '/api/media/movie/603',
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());

    expect(getJson).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('mantiene separadas las fichas de diferentes IDs', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    getJson.mockImplementation(async (segments: readonly (string | number)[]) => ({
      id: segments[1],
      title: `Película ${segments[1]}`,
    }));

    const first = await app.inject({
      method: 'GET',
      url: '/api/media/movie/603',
    });

    const second = await app.inject({
      method: 'GET',
      url: '/api/media/movie/604',
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: '404 cuando el contenido no existe',
      error: new TmdbNotFoundError(),
      status: 404,
    },
    {
      name: '502 cuando TMDB devuelve datos inválidos',
      error: new TmdbInvalidResponseError({
        reason: 'invalid_json',
      }),
      status: 502,
    },
    {
      name: '503 cuando TMDB está indisponible',
      error: new TmdbUnavailableError(),
      status: 503,
    },
    {
      name: '504 cuando TMDB agota el tiempo',
      error: new TmdbTimeoutError(),
      status: 504,
    },
  ])('devuelve $name', async ({ error, status }) => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    getJson.mockRejectedValueOnce(error);

    const response = await app.inject({
      method: 'GET',
      url: '/api/media/movie/603',
    });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toHaveProperty('error');
    expect(getJson).toHaveBeenCalledOnce();
  });

  it('devuelve 429 y Retry-After cuando TMDB limita las peticiones', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    getJson.mockRejectedValueOnce(new TmdbRateLimitError(2));

    const response = await app.inject({
      method: 'GET',
      url: '/api/media/movie/603',
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('2');
  });

  it('no consulta TMDB si falla la comprobación de sesión', async () => {
    const { app, getSession, getJson } = createTestApp({
      authenticated: true,
    });

    getSession.mockRejectedValueOnce(new Error('Database unavailable'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/media/movie/603',
    });

    expect(response.statusCode).toBe(503);
    expect(getJson).not.toHaveBeenCalled();
    expect(response.body).not.toContain('Database unavailable');
  });

  it('vuelve a consultar TMDB cuando caduca la caché del detalle', async () => {
    const { app, getJson, getSession } = createTestApp({
      authenticated: true,
    });

    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now');

    try {
      dateNow.mockReturnValue(now);

      const first = await app.inject({
        method: 'GET',
        url: '/api/media/movie/603',
      });

      expect(first.statusCode).toBe(200);
      expect(getJson).toHaveBeenCalledTimes(1);

      // Antes de cinco minutos: reutilizar la caché.
      dateNow.mockReturnValue(now + SEARCH_CACHE_TTL_MS - 1);

      const second = await app.inject({
        method: 'GET',
        url: '/api/media/movie/603',
      });

      expect(second.statusCode).toBe(200);
      expect(getJson).toHaveBeenCalledTimes(1);

      // Al alcanzar los cinco minutos: consultar de nuevo.
      dateNow.mockReturnValue(now + SEARCH_CACHE_TTL_MS);

      const third = await app.inject({
        method: 'GET',
        url: '/api/media/movie/603',
      });

      expect(third.statusCode).toBe(200);
      expect(getJson).toHaveBeenCalledTimes(2);

      // La autenticación se comprueba en las tres peticiones.
      expect(getSession).toHaveBeenCalledTimes(3);
    } finally {
      dateNow.mockRestore();
    }
  });

  it('no devuelve detalles caducados cuando TMDB falla', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now');

    try {
      dateNow.mockReturnValue(now);

      // Primera petición: se obtiene y almacena el detalle.
      const first = await app.inject({
        method: 'GET',
        url: '/api/media/movie/603',
      });

      expect(first.statusCode).toBe(200);
      expect(getJson).toHaveBeenCalledTimes(1);

      // Simulamos que han transcurrido más de cinco minutos.
      dateNow.mockReturnValue(now + SEARCH_CACHE_TTL_MS + 1);

      // TMDB deja de estar disponible.
      getJson.mockRejectedValueOnce(new TmdbUnavailableError());

      const second = await app.inject({
        method: 'GET',
        url: '/api/media/movie/603',
      });

      expect(second.statusCode).toBe(503);
      expect(second.json()).not.toEqual(first.json());
      expect(getJson).toHaveBeenCalledTimes(2);

      // El fallo no debe quedar almacenado en caché.
      const third = await app.inject({
        method: 'GET',
        url: '/api/media/movie/603',
      });

      expect(third.statusCode).toBe(200);
      expect(getJson).toHaveBeenCalledTimes(3);
    } finally {
      dateNow.mockRestore();
    }
  });

  it('limita a 20 las consultas de detalle simultáneas', async () => {
    const { app, getJson } = createTestApp({
      authenticated: true,
    });

    const resolvers: Array<(value: unknown) => void> = [];

    getJson.mockImplementation(
      () =>
        new Promise<unknown>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const pendingRequests = Array.from({ length: 20 }, (_, index) =>
      app.inject({
        method: 'GET',
        url: `/api/media/movie/${index + 1}`,
      }),
    );

    const tmdbResponse = {
      id: 603,
      title: 'Matrix',
      original_title: 'The Matrix',
    };

    try {
      // Las 20 consultas llegan al cliente simulado.
      await vi.waitFor(() => {
        expect(getJson).toHaveBeenCalledTimes(20);
      });

      // La consulta 21 debe rechazarse antes de llamar a TMDB.
      const overloaded = await app.inject({
        method: 'GET',
        url: '/api/media/movie/999',
      });

      expect(overloaded.statusCode).toBe(503);
      expect(overloaded.headers['retry-after']).toBe('1');
      expect(overloaded.json()).toEqual({
        error: 'La capacidad de búsqueda del catálogo se ha excedido.',
      });

      expect(getJson).toHaveBeenCalledTimes(20);
    } finally {
      // Liberar todas las peticiones para no dejar tests bloqueados.
      for (const [index, resolve] of resolvers.entries()) {
        resolve({ ...tmdbResponse, id: index + 1 });
      }

      await Promise.all(pendingRequests);
    }
  });
  it('no entrega una ficha cacheada al perder la sesión', async () => {
    const { app, getSession, getJson } = createTestApp({ authenticated: true });
    expect((await app.inject('/api/media/movie/603')).statusCode).toBe(200);
    getSession.mockResolvedValueOnce(null);
    expect((await app.inject('/api/media/movie/603')).statusCode).toBe(401);
    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it('devuelve 502 si el ID devuelto no coincide y permite reintentar', async () => {
    const { app, getJson } = createTestApp({ authenticated: true });
    getJson.mockResolvedValueOnce({ id: 604, title: 'Otro título' });
    expect((await app.inject('/api/media/movie/603')).statusCode).toBe(502);
    expect((await app.inject('/api/media/movie/603')).statusCode).toBe(200);
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it('oculta errores inesperados y no cachea el fallo', async () => {
    const { app, getJson } = createTestApp({ authenticated: true });
    getJson.mockRejectedValueOnce(new Error('sensitive-fixture'));
    const response = await app.inject('/api/media/movie/603');
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('sensitive-fixture');
    expect((await app.inject('/api/media/movie/603')).statusCode).toBe(200);
  });

  it.each(['movie', 'tv'] as const)(
    'entrega los contratos enriquecidos por HTTP para %s',
    async (type) => {
      const { app } = createTestApp({
        authenticated: true,
        response: {
          id: 603,
          title: 'Película',
          name: 'Serie',
          created_by: [{ id: 9, name: 'Creadora' }],
          credits: {
            cast: [{ id: 7, name: 'Actriz' }],
            crew: [{ id: 8, name: 'Directora', job: 'Director' }],
          },
          videos: {
            results: [
              { id: 'v', site: 'YouTube', key: 'abcdefghijk', name: 'Tráiler', type: 'Trailer' },
            ],
          },
          'watch/providers': {
            results: { ES: { flatrate: [{ provider_id: 1, provider_name: 'Plataforma' }] } },
          },
        },
      });
      const response = await app.inject(`/api/media/${type}/603`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        cast: [{ tmdbId: 7 }],
        trailer: { site: 'YouTube' },
        watchProviders: { region: 'ES', subscription: [{ tmdbId: 1 }] },
        [type === 'movie' ? 'directors' : 'creators']: [{ tmdbId: type === 'movie' ? 8 : 9 }],
      });
    },
  );
  it('no permite consultas arbitrarias ni filtra las cookies de Better Auth', async () => {
    const { app, getSession, getJson } = createTestApp({ authenticated: true });
    const response = await app.inject({
      url: '/api/media/movie/603?region=US',
      headers: { cookie: 'session=fixture-cookie' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const headers = getSession.mock.calls[0]?.[0].headers as Headers;
    expect(headers.get('cookie')).toBe('session=fixture-cookie');
    expect(response.body).not.toContain('fixture-cookie');
    expect(getJson).not.toHaveBeenCalled();
  });
});
