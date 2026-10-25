import { describe, expect, it } from 'vitest';

import { normalizeMediaDetail } from './catalog.detail.normalize.js';
import { TmdbInvalidResponseError } from './tmdb.errors.js';

describe('normalizeMediaDetail', () => {
  const movie = {
    id: 603,
    title: 'Matrix',
    original_title: 'The Matrix',
    release_date: '1999-03-31',
    overview: 'Un hacker descubre la verdad.',
    poster_path: '/matrix.jpg',
    backdrop_path: '/matrix-bg.jpg',
    vote_average: 8.2,
    vote_count: 25000,
    runtime: 136,
    genres: [
      { id: 28, name: 'Acción' },
      { id: 878, name: 'Ciencia ficción' },
    ],
    status: 'Released',
    tagline: 'Welcome to the Real World.',
  };

  const tv = {
    id: 1396,
    name: 'Breaking Bad',
    original_name: 'Breaking Bad',
    first_air_date: '2008-01-20',
    overview: 'La historia de Walter White.',
    poster_path: '/breakingbad.jpg',
    backdrop_path: '/breakingbad-bg.jpg',
    vote_average: 8.9,
    vote_count: 15000,
    number_of_seasons: 5,
    number_of_episodes: 62,
    status: 'Ended',
    genres: [{ id: 18, name: 'Drama' }],
    seasons: [
      {
        season_number: 0,
        name: 'Especiales',
        episode_count: 8,
        air_date: null,
        poster_path: null,
      },
      {
        season_number: 1,
        name: 'Temporada 1',
        episode_count: 7,
        air_date: '2008-01-20',
        poster_path: '/season1.jpg',
      },
    ],
  };

  it('normaliza el detalle de una película', () => {
    const result = normalizeMediaDetail(movie, 'movie');

    expect(result).toMatchObject({
      source: 'tmdb',
      type: 'movie',
      tmdbId: 603,
      title: 'Matrix',
      originalTitle: 'The Matrix',
      year: 1999,
      releaseDate: '1999-03-31',
      runtime: 136,
      status: 'Released',
      tagline: 'Welcome to the Real World.',
      genres: [
        { id: 28, name: 'Acción' },
        { id: 878, name: 'Ciencia ficción' },
      ],
    });

    expect(result.posterUrl).toBe('https://image.tmdb.org/t/p/w342/matrix.jpg');
    expect(result.backdropUrl).toBe('https://image.tmdb.org/t/p/w1280/matrix-bg.jpg');
  });

  it('normaliza el detalle de una serie', () => {
    const result = normalizeMediaDetail(tv, 'tv');

    expect(result).toMatchObject({
      source: 'tmdb',
      type: 'tv',
      tmdbId: 1396,
      title: 'Breaking Bad',
      year: 2008,
      firstAirDate: '2008-01-20',
      numberOfSeasons: 5,
      numberOfEpisodes: 62,
      status: 'Ended',
      genres: [{ id: 18, name: 'Drama' }],
    });
  });

  it('identifica la temporada 0 como especiales', () => {
    const result = normalizeMediaDetail(tv, 'tv');

    expect(result.type).toBe('tv');

    if (result.type !== 'tv') return;

    expect(result.seasons).toHaveLength(2);
    expect(result.seasons[0]?.isSpecial).toBe(true);
    expect(result.seasons[1]?.isSpecial).toBe(false);
    expect(result.seasons[1]?.episodeCount).toBe(7);
  });

  it('conserva las temporadas especiales sin mezclarlas con las normales', () => {
    const result = normalizeMediaDetail(tv, 'tv');

    if (result.type !== 'tv') {
      throw new Error('Expected TV detail');
    }

    expect(result.seasons.map((season) => season.seasonNumber)).toEqual([0, 1]);

    expect(result.seasons[0]?.isSpecial).toBe(true);
  });

  it('convierte los campos opcionales ausentes a null', () => {
    const result = normalizeMediaDetail(
      {
        id: 100,
        title: 'Película sin información',
      },
      'movie',
    );

    expect(result).toMatchObject({
      tmdbId: 100,
      originalTitle: 'Película sin información',
      year: null,
      overview: null,
      posterUrl: null,
      backdropUrl: null,
      releaseDate: null,
      runtime: null,
      status: null,
      tagline: null,
      genres: [],
    });
  });

  it('descarta géneros inválidos', () => {
    const result = normalizeMediaDetail(
      {
        ...movie,
        genres: [
          { id: 28, name: 'Acción' },
          { id: -1, name: 'Incorrecto' },
          { id: 5, name: '' },
          null,
          'género',
        ],
      },
      'movie',
    );

    expect(result.genres).toEqual([{ id: 28, name: 'Acción' }]);
  });

  it('descarta temporadas con números o episodios inválidos', () => {
    const result = normalizeMediaDetail(
      {
        ...tv,
        seasons: [
          { season_number: 1, episode_count: 7 },
          { season_number: -1, episode_count: 3 },
          { season_number: 2, episode_count: -5 },
          { season_number: 3, episode_count: '10' },
        ],
      },
      'tv',
    );

    if (result.type !== 'tv') {
      throw new Error('Expected TV detail');
    }

    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0]).toMatchObject({
      seasonNumber: 1,
      episodeCount: 7,
    });
  });

  it('rechaza fechas de calendario inválidas', () => {
    const result = normalizeMediaDetail(
      {
        ...movie,
        release_date: '2026-02-30',
      },
      'movie',
    );

    expect(result.type).toBe('movie');

    if (result.type !== 'movie') return;

    expect(result.releaseDate).toBeNull();
  });

  it('rechaza rutas de imagen inválidas', () => {
    const result = normalizeMediaDetail(
      {
        ...movie,
        poster_path: 'https://example.com/foto.jpg',
        backdrop_path: '/../../foto.jpg',
      },
      'movie',
    );

    expect(result.posterUrl).toBeNull();
    expect(result.backdropUrl).toBeNull();
  });

  it('rechaza respuestas sin identidad válida', () => {
    expect(() =>
      normalizeMediaDetail(
        {
          title: 'Sin identificador',
        },
        'movie',
      ),
    ).toThrow(TmdbInvalidResponseError);

    expect(() =>
      normalizeMediaDetail(
        {
          id: 123,
        },
        'movie',
      ),
    ).toThrow(TmdbInvalidResponseError);
  });

  it('rechaza respuestas que no son objetos', () => {
    expect(() => normalizeMediaDetail(null, 'movie')).toThrow(TmdbInvalidResponseError);

    expect(() => normalizeMediaDetail([], 'tv')).toThrow(TmdbInvalidResponseError);
  });
});
