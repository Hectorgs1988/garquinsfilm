import { describe, expect, it, vi } from 'vitest';

import { createTmdbClient, type TmdbClient } from './tmdb.client.js';
import { CatalogCache } from './catalog.cache.js';
import { createCatalogDetailService } from './catalog.detail.js';
import { TmdbInvalidResponseError } from './tmdb.errors.js';

describe('createCatalogDetailService', () => {
  function createClient() {
    const getJson = vi.fn().mockResolvedValue({
      id: 603,
      title: 'Matrix',
      original_title: 'The Matrix',
      release_date: '1999-03-31',
      runtime: 136,
    });

    const client: TmdbClient = {
      language: 'es-ES',
      region: 'ES',
      getJson,
    };

    return { client, getJson };
  }

  it('solicita correctamente el detalle de una película', async () => {
    const { client, getJson } = createClient();
    const service = createCatalogDetailService(client);

    const result = await service.getDetail({
      type: 'movie',
      tmdbId: 603,
    });

    expect(getJson).toHaveBeenCalledExactlyOnceWith(['movie', 603], {
      language: 'es-ES',
      append_to_response: 'credits,videos,watch/providers',
    });

    expect(result).toMatchObject({
      source: 'tmdb',
      type: 'movie',
      tmdbId: 603,
      title: 'Matrix',
      runtime: 136,
    });
  });

  it('solicita correctamente el detalle de una serie', async () => {
    const { client, getJson } = createClient();

    getJson.mockResolvedValue({
      id: 1396,
      name: 'Breaking Bad',
      original_name: 'Breaking Bad',
      first_air_date: '2008-01-20',
      number_of_seasons: 5,
      number_of_episodes: 62,
      seasons: [],
    });

    const service = createCatalogDetailService(client);

    const result = await service.getDetail({
      type: 'tv',
      tmdbId: 1396,
    });

    expect(getJson).toHaveBeenCalledExactlyOnceWith(['tv', 1396], {
      language: 'es-ES',
      append_to_response: 'credits,videos,watch/providers',
    });

    expect(result).toMatchObject({
      source: 'tmdb',
      type: 'tv',
      tmdbId: 1396,
      title: 'Breaking Bad',
      numberOfSeasons: 5,
      numberOfEpisodes: 62,
    });
  });

  it('reutiliza la caché para consultas idénticas', async () => {
    const { client, getJson } = createClient();
    const service = createCatalogDetailService(client);

    const first = await service.getDetail({
      type: 'movie',
      tmdbId: 603,
    });

    const second = await service.getDetail({
      type: 'movie',
      tmdbId: 603,
    });

    expect(first).toEqual(second);
    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it('distingue películas y series con el mismo ID', async () => {
    const { client, getJson } = createClient();

    getJson.mockImplementation(async (segments: readonly (string | number)[]) => {
      if (segments[0] === 'movie') {
        return { id: 100, title: 'Película' };
      }

      return { id: 100, name: 'Serie' };
    });

    const service = createCatalogDetailService(client);

    const movie = await service.getDetail({
      type: 'movie',
      tmdbId: 100,
    });

    const tv = await service.getDetail({
      type: 'tv',
      tmdbId: 100,
    });

    expect(movie.type).toBe('movie');
    expect(tv.type).toBe('tv');
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it('distingue diferentes IDs', async () => {
    const { client, getJson } = createClient();

    getJson.mockImplementation(async (segments: readonly (string | number)[]) => ({
      id: segments[1],
      title: `Película ${segments[1]}`,
    }));

    const service = createCatalogDetailService(client);

    await service.getDetail({ type: 'movie', tmdbId: 100 });
    await service.getDetail({ type: 'movie', tmdbId: 200 });

    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it('reutiliza una caché inyectada entre servicios', async () => {
    const { client, getJson } = createClient();
    const cache = new CatalogCache<
      Awaited<ReturnType<ReturnType<typeof createCatalogDetailService>['getDetail']>>
    >();

    const firstService = createCatalogDetailService(client, { cache });
    const secondService = createCatalogDetailService(client, { cache });

    await firstService.getDetail({ type: 'movie', tmdbId: 603 });
    await secondService.getDetail({ type: 'movie', tmdbId: 603 });

    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it('comparte peticiones simultáneas para un mismo detalle', async () => {
    const { client, getJson } = createClient();

    const service = createCatalogDetailService(client);

    const [first, second] = await Promise.all([
      service.getDetail({ type: 'movie', tmdbId: 603 }),
      service.getDetail({ type: 'movie', tmdbId: 603 }),
    ]);

    expect(first).toEqual(second);
    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it('propaga los errores del cliente TMDB', async () => {
    const { client, getJson } = createClient();

    const failure = new Error('Upstream unavailable');
    getJson.mockRejectedValue(failure);

    const service = createCatalogDetailService(client);

    await expect(service.getDetail({ type: 'movie', tmdbId: 603 })).rejects.toBe(failure);
  });

  it('rechaza respuestas inválidas sin almacenarlas en caché', async () => {
    const { client, getJson } = createClient();

    getJson.mockResolvedValueOnce({ id: 603 }).mockResolvedValueOnce({
      id: 603,
      title: 'Matrix',
    });

    const service = createCatalogDetailService(client);

    await expect(service.getDetail({ type: 'movie', tmdbId: 603 })).rejects.toBeInstanceOf(
      TmdbInvalidResponseError,
    );

    const result = await service.getDetail({
      type: 'movie',
      tmdbId: 603,
    });

    expect(result.title).toBe('Matrix');
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it('mantiene entradas independientes por idioma y región', async () => {
    const cache = new CatalogCache<
      Awaited<ReturnType<ReturnType<typeof createCatalogDetailService>['getDetail']>>
    >();

    const getJson = vi.fn().mockResolvedValue({
      id: 603,
      title: 'Matrix',
    });

    const es = createCatalogDetailService(
      {
        language: 'es-ES',
        region: 'ES',
        getJson,
      },
      { cache },
    );

    const en = createCatalogDetailService(
      {
        language: 'en-US',
        region: 'US',
        getJson,
      },
      { cache },
    );

    await es.getDetail({ type: 'movie', tmdbId: 603 });
    await en.getDetail({ type: 'movie', tmdbId: 603 });

    expect(getJson).toHaveBeenCalledTimes(2);
  });
});

describe('caché del detalle enriquecido', () => {
  it.each(['movie', 'tv'] as const)(
    'no cachea ID discordante ni errores; recupera %s',
    async (type) => {
      const getJson = vi
        .fn()
        .mockResolvedValueOnce({ id: 99, title: 'Otro', name: 'Otro' })
        .mockRejectedValueOnce(new Error('Fallo simulado'))
        .mockResolvedValue({
          id: 10,
          title: 'Título',
          name: 'Título',
          credits: { cast: [{ id: 7, name: 'Actor' }] },
        });
      const cache = new CatalogCache<
        Awaited<ReturnType<ReturnType<typeof createCatalogDetailService>['getDetail']>>
      >();
      const service = createCatalogDetailService(
        { language: 'es-ES', region: 'ES', getJson },
        { cache },
      );
      const params = { type, tmdbId: 10 };
      await expect(service.getDetail(params)).rejects.toBeInstanceOf(TmdbInvalidResponseError);
      expect(cache.size).toBe(0);
      await expect(service.getDetail(params)).rejects.toThrow('Fallo simulado');
      expect(cache.size).toBe(0);
      expect((await service.getDetail(params)).cast[0]?.tmdbId).toBe(7);
      await service.getDetail(params);
      expect(getJson).toHaveBeenCalledTimes(3);
    },
  );

  it('aplica LRU al detalle completo y renueva los anexos al caducar', async () => {
    let now = 0;
    let name = 'Inicial';
    const getJson = vi.fn(async (segments: readonly (string | number)[]) => ({
      id: segments[1],
      title: 'Título',
      credits: { cast: [{ id: 7, name }] },
    }));
    const cache = new CatalogCache<
      Awaited<ReturnType<ReturnType<typeof createCatalogDetailService>['getDetail']>>
    >({ now: () => now, maxEntries: 2 });
    const service = createCatalogDetailService(
      { language: 'es-ES', region: 'ES', getJson },
      { cache },
    );
    for (const tmdbId of [1, 2, 1, 3, 1]) await service.getDetail({ type: 'movie', tmdbId });
    expect(getJson).toHaveBeenCalledTimes(3);
    await service.getDetail({ type: 'movie', tmdbId: 2 });
    expect(getJson).toHaveBeenCalledTimes(4);
    now = 5 * 60 * 1000;
    name = 'Actualizado';
    const result = await service.getDetail({ type: 'movie', tmdbId: 2 });
    expect(result.cast[0]?.name).toBe('Actualizado');
    expect(getJson).toHaveBeenCalledTimes(5);
  });
});

describe('composición con el transporte simulado', () => {
  it.each(['movie', 'tv'] as const)(
    'anexa créditos, vídeos y streaming en una sola petición %s',
    async (type) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 10,
            title: 'Película',
            name: 'Serie',
            credits: { id: 10, cast: [{ id: 7, name: 'Actriz' }] },
            videos: { id: 10, results: [] },
            'watch/providers': {
              id: 10,
              results: { ES: { rent: [{ provider_id: 8, provider_name: 'Alquiler' }] } },
            },
          }),
          { status: 200 },
        ),
      );
      const client = createTmdbClient({
        config: {
          readAccessToken: 'test-only-fixture',
          language: 'es-ES',
          region: 'ES',
          timeoutMs: 1000,
        },
        fetch,
      });
      const service = createCatalogDetailService(client);
      const result = await service.getDetail({ type, tmdbId: 10 });
      const url = new URL(fetch.mock.calls[0]?.[0]);
      expect(url.origin).toBe('https://api.themoviedb.org');
      expect(url.pathname).toBe(`/3/${type}/10`);
      expect([...url.searchParams.entries()]).toEqual([
        ['language', 'es-ES'],
        ['append_to_response', 'credits,videos,watch/providers'],
      ]);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.cast[0]?.tmdbId).toBe(7);
      expect(result.watchProviders.rent[0]?.tmdbId).toBe(8);
      expect(JSON.stringify(result)).not.toContain('test-only-fixture');
      await service.getDetail({ type, tmdbId: 10 });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
});
