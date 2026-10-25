import { describe, expect, it } from 'vitest';
import {
  normalizeMediaSummary,
  normalizeMultiSearchItem,
  normalizeSearchResponse,
} from './catalog.normalize.js';

describe('Catalog normalization', () => {
  it('normaliza una película', () => {
    const result = normalizeMediaSummary(
      {
        id: 603,
        title: 'Matrix',
        original_title: 'The Matrix',
        release_date: '1999-03-31',
        overview: 'Una historia de ciencia ficción.',
        poster_path: '/matrix.jpg',
        vote_average: 8.2,
        vote_count: 25000,
      },
      'movie',
    );

    expect(result).toEqual({
      source: 'tmdb',
      type: 'movie',
      tmdbId: 603,
      title: 'Matrix',
      originalTitle: 'The Matrix',
      year: 1999,
      overview: 'Una historia de ciencia ficción.',
      posterUrl: 'https://image.tmdb.org/t/p/w342/matrix.jpg',
      voteAverage: 8.2,
      voteCount: 25000,
    });
  });

  it('normaliza una serie', () => {
    const result = normalizeMediaSummary(
      {
        id: 1396,
        name: 'Breaking Bad',
        original_name: 'Breaking Bad',
        first_air_date: '2008-01-20',
        overview: '',
        poster_path: null,
        vote_average: 9.1,
        vote_count: 12000,
      },
      'tv',
    );

    expect(result).toMatchObject({
      type: 'tv',
      tmdbId: 1396,
      title: 'Breaking Bad',
      originalTitle: 'Breaking Bad',
      year: 2008,
      overview: null,
      posterUrl: null,
    });
  });

  it('descarta personas de la búsqueda múltiple', () => {
    const result = normalizeMultiSearchItem({
      id: 123,
      media_type: 'person',
      name: 'Actor de ejemplo',
    });

    expect(result).toBeNull();
  });

  it('rechaza entradas sin identificador o título válido', () => {
    expect(normalizeMediaSummary({ id: -1, title: 'Test' }, 'movie')).toBeNull();
    expect(normalizeMediaSummary({ id: 10 }, 'movie')).toBeNull();
    expect(normalizeMediaSummary(null, 'movie')).toBeNull();
  });

  it('utiliza el título traducido si falta el original', () => {
    const result = normalizeMediaSummary({ id: 10, title: 'Película de ejemplo' }, 'movie');

    expect(result?.originalTitle).toBe('Película de ejemplo');
  });

  it('convierte datos opcionales inválidos en null', () => {
    const result = normalizeMediaSummary(
      {
        id: 10,
        title: 'Película',
        release_date: '',
        poster_path: 'https://otro-servidor.com/imagen.jpg',
        vote_average: '9',
        vote_count: -1,
      },
      'movie',
    );

    expect(result).toMatchObject({
      year: null,
      posterUrl: null,
      voteAverage: null,
      voteCount: null,
    });
  });

  it('conserva correctamente una puntuación de cero', () => {
    const result = normalizeMediaSummary(
      {
        id: 10,
        title: 'Película',
        vote_average: 0,
        vote_count: 0,
      },
      'movie',
    );

    expect(result?.voteAverage).toBe(0);
    expect(result?.voteCount).toBe(0);
  });

  describe('Search response normalization', () => {
    it('normaliza una página de películas', () => {
      const result = normalizeSearchResponse(
        {
          page: 1,
          total_pages: 3,
          total_results: 45,
          results: [
            {
              id: 603,
              title: 'Matrix',
              original_title: 'The Matrix',
              release_date: '1999-03-31',
            },
          ],
        },
        'movie',
      );

      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(3);
      expect(result.totalResults).toBe(45);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        source: 'tmdb',
        type: 'movie',
        tmdbId: 603,
        title: 'Matrix',
        year: 1999,
      });
    });

    it('normaliza una página de series', () => {
      const result = normalizeSearchResponse(
        {
          page: 2,
          total_pages: 4,
          total_results: 70,
          results: [
            {
              id: 1396,
              name: 'Breaking Bad',
              original_name: 'Breaking Bad',
              first_air_date: '2008-01-20',
            },
          ],
        },
        'tv',
      );

      expect(result.page).toBe(2);
      expect(result.results[0]).toMatchObject({
        type: 'tv',
        tmdbId: 1396,
        title: 'Breaking Bad',
        year: 2008,
      });
    });

    it('filtra personas en búsquedas mixtas', () => {
      const result = normalizeSearchResponse(
        {
          page: 1,
          total_pages: 1,
          total_results: 3,
          results: [
            { id: 1, media_type: 'movie', title: 'Película' },
            { id: 2, media_type: 'person', name: 'Actor' },
            { id: 3, media_type: 'tv', name: 'Serie' },
          ],
        },
        'all',
      );

      expect(result.results).toHaveLength(2);
      expect(result.results.map((item) => item.type)).toEqual(['movie', 'tv']);

      // Los totales siguen siendo los originales de TMDB.
      expect(result.totalResults).toBe(3);
    });

    it('acepta una página vacía válida', () => {
      const result = normalizeSearchResponse(
        {
          page: 1,
          total_pages: 0,
          total_results: 0,
          results: [],
        },
        'movie',
      );

      expect(result.results).toEqual([]);
      expect(result.totalPages).toBe(0);
      expect(result.totalResults).toBe(0);
    });

    it('rechaza una respuesta paginada inválida', () => {
      expect(() =>
        normalizeSearchResponse(
          { page: '1', total_pages: 1, total_results: 10, results: [] },
          'movie',
        ),
      ).toThrow();

      expect(() =>
        normalizeSearchResponse(
          { page: 1, total_pages: 1, total_results: 10, results: {} },
          'movie',
        ),
      ).toThrow();

      expect(() => normalizeSearchResponse(null, 'movie')).toThrow();
    });
  });
});
