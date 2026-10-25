import { describe, expect, it, vi } from 'vitest';
import type { TmdbClient } from './tmdb.client.js';
import { createCatalogSearchService } from './catalog.search.js';

describe('CatalogSearchService', () => {
  const createClient = () => {
    const getJson = vi.fn().mockResolvedValue({
      page: 1,
      results: [],
      total_pages: 0,
      total_results: 0,
    });

    const client: TmdbClient = {
      language: 'es-ES',
      region: 'ES',
      getJson,
    };

    return { client, getJson };
  };

  it('busca películas con idioma y región', async () => {
    const { client, getJson } = createClient();

    await createCatalogSearchService(client).search({
      query: 'Interstellar',
      type: 'movie',
      page: 1,
    });

    expect(getJson).toHaveBeenCalledExactlyOnceWith(['search', 'movie'], {
      query: 'Interstellar',
      page: 1,
      language: 'es-ES',
      include_adult: false,
      region: 'ES',
    });
  });

  it('busca series sin enviar región', async () => {
    const { client, getJson } = createClient();

    await createCatalogSearchService(client).search({
      query: 'Breaking Bad',
      type: 'tv',
      page: 2,
    });

    expect(getJson).toHaveBeenCalledExactlyOnceWith(['search', 'tv'], {
      query: 'Breaking Bad',
      page: 2,
      language: 'es-ES',
      include_adult: false,
    });
  });

  it('utiliza búsqueda múltiple para películas y series', async () => {
    const { client, getJson } = createClient();

    await createCatalogSearchService(client).search({
      query: 'Dune',
      type: 'all',
      page: 1,
    });

    expect(getJson).toHaveBeenCalledExactlyOnceWith(['search', 'multi'], {
      query: 'Dune',
      page: 1,
      language: 'es-ES',
      include_adult: false,
    });
  });

  describe('Catalog search integration', () => {
    it('devuelve películas normalizadas', async () => {
      const getJson = vi.fn().mockResolvedValue({
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [
          {
            id: 603,
            title: 'Matrix',
            original_title: 'The Matrix',
            release_date: '1999-03-31',
            poster_path: '/matrix.jpg',
            vote_average: 8.2,
            vote_count: 25000,
          },
        ],
      });

      const client: TmdbClient = {
        language: 'es-ES',
        region: 'ES',
        getJson,
      };

      const result = await createCatalogSearchService(client).search({
        query: 'Matrix',
        type: 'movie',
        page: 1,
      });

      expect(result).toMatchObject({
        page: 1,
        totalPages: 1,
        totalResults: 1,
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        source: 'tmdb',
        type: 'movie',
        tmdbId: 603,
        title: 'Matrix',
        originalTitle: 'The Matrix',
        year: 1999,
        posterUrl: 'https://image.tmdb.org/t/p/w342/matrix.jpg',
      });
    });

    it('descarta personas en la búsqueda mixta', async () => {
      const getJson = vi.fn().mockResolvedValue({
        page: 1,
        total_pages: 1,
        total_results: 3,
        results: [
          { id: 1, media_type: 'movie', title: 'Película' },
          { id: 2, media_type: 'person', name: 'Actor' },
          { id: 3, media_type: 'tv', name: 'Serie' },
        ],
      });

      const client: TmdbClient = {
        language: 'es-ES',
        region: 'ES',
        getJson,
      };

      const result = await createCatalogSearchService(client).search({
        query: 'Ejemplo',
        type: 'all',
        page: 1,
      });

      expect(result.results).toHaveLength(2);
      expect(result.results.map((item) => item.type)).toEqual(['movie', 'tv']);
      expect(result.totalResults).toBe(3);
    });

    it('propaga los errores del cliente TMDB', async () => {
      const error = new Error('TMDB unavailable');

      const client: TmdbClient = {
        language: 'es-ES',
        region: 'ES',
        getJson: vi.fn().mockRejectedValue(error),
      };

      await expect(
        createCatalogSearchService(client).search({
          query: 'Matrix',
          type: 'movie',
          page: 1,
        }),
      ).rejects.toBe(error);
    });

    it('rechaza respuestas paginadas inválidas', async () => {
      const client: TmdbClient = {
        language: 'es-ES',
        region: 'ES',
        getJson: vi.fn().mockResolvedValue({
          page: 'invalid',
          results: [],
        }),
      };

      await expect(
        createCatalogSearchService(client).search({
          query: 'Matrix',
          type: 'movie',
          page: 1,
        }),
      ).rejects.toThrow();
    });
  });
});
