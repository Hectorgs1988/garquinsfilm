import type { MediaDetail, MediaSummary, MediaWatchProviders } from '@garquinsfilm/shared';

// Datos exclusivamente ficticios.
// No representan títulos, valoraciones ni disponibilidad reales de TMDB.

const EMPTY_WATCH_PROVIDERS: MediaWatchProviders = {
  region: 'ES',
  attribution: 'JustWatch',
  link: null,
  subscription: [],
  rent: [],
  buy: [],
};

export const DEMO_DETAILS: MediaDetail[] = [
  {
    source: 'tmdb',
    type: 'movie',
    tmdbId: 1,
    title: 'La última frontera',
    originalTitle: 'La última frontera',
    year: 2024,
    overview:
      'Una exploradora emprende un viaje hacia una región desconocida, donde descubrirá que los límites del mundo no son los que imaginaba.',
    posterUrl: null,
    backdropUrl: null,
    voteAverage: 8.2,
    voteCount: 120,
    releaseDate: '2024-06-14',
    runtime: 128,
    genres: [
      { id: 1, name: 'Aventura' },
      { id: 2, name: 'Ciencia ficción' },
      { id: 3, name: 'Drama' },
    ],
    status: 'Released',
    tagline: 'Más allá de lo conocido.',
    cast: [
      {
        tmdbId: 101,
        name: 'Elena Vega',
        character: 'Clara',
        profileUrl: null,
        order: 0,
      },
      {
        tmdbId: 102,
        name: 'Daniel Ríos',
        character: 'Marcos',
        profileUrl: null,
        order: 1,
      },
      {
        tmdbId: 103,
        name: 'Lucía Campos',
        character: 'Dra. Salvatierra',
        profileUrl: null,
        order: 2,
      },
    ],
    directors: [
      {
        tmdbId: 104,
        name: 'Adrián Montes',
        job: 'Director',
        profileUrl: null,
      },
    ],
    videos: [],
    trailer: null,
    watchProviders: {
      ...EMPTY_WATCH_PROVIDERS,
      subscription: [
        {
          tmdbId: 201,
          name: 'CinePlus Demo',
          logoUrl: null,
        },
      ],
      rent: [
        {
          tmdbId: 202,
          name: 'Videoclub Demo',
          logoUrl: null,
        },
      ],
    },
  },
  {
    source: 'tmdb',
    type: 'tv',
    tmdbId: 2,
    title: 'Horizontes',
    originalTitle: 'Horizontes',
    year: 2025,
    overview:
      'Un grupo de amigos regresa a su ciudad natal y descubre una historia que cambiará sus vidas para siempre.',
    posterUrl: null,
    backdropUrl: null,
    voteAverage: 7.9,
    voteCount: 85,
    firstAirDate: '2025-03-20',
    numberOfSeasons: 2,
    numberOfEpisodes: 16,
    status: 'Returning Series',
    genres: [
      { id: 4, name: 'Drama' },
      { id: 5, name: 'Misterio' },
    ],
    cast: [
      {
        tmdbId: 301,
        name: 'Sara Molina',
        character: 'Ana',
        profileUrl: null,
        order: 0,
      },
      {
        tmdbId: 302,
        name: 'Pablo Herrera',
        character: 'Javier',
        profileUrl: null,
        order: 1,
      },
    ],
    creators: [
      {
        tmdbId: 303,
        name: 'Marina Soler',
        job: 'Creator',
        profileUrl: null,
      },
    ],
    videos: [],
    trailer: null,
    watchProviders: {
      ...EMPTY_WATCH_PROVIDERS,
      subscription: [
        {
          tmdbId: 204,
          name: 'SeriesPlay Demo',
          logoUrl: null,
        },
      ],
    },
    seasons: [
      {
        seasonNumber: 1,
        name: 'Temporada 1',
        episodeCount: 8,
        airDate: '2025-03-20',
        posterUrl: null,
        isSpecial: false,
      },
      {
        seasonNumber: 2,
        name: 'Temporada 2',
        episodeCount: 8,
        airDate: '2026-04-10',
        posterUrl: null,
        isSpecial: false,
      },
    ],
  },
];

const DETAIL_SUMMARIES: MediaSummary[] = DEMO_DETAILS.map((detail) => ({
  source: detail.source,
  type: detail.type,
  tmdbId: detail.tmdbId,
  title: detail.title,
  originalTitle: detail.originalTitle,
  year: detail.year,
  overview: detail.overview,
  posterUrl: detail.posterUrl,
  voteAverage: detail.voteAverage,
  voteCount: detail.voteCount,
}));

export const DEMO_MEDIA: MediaSummary[] = [
  ...DETAIL_SUMMARIES,
  {
    source: 'tmdb',
    type: 'movie',
    tmdbId: 3,
    title: 'El eco del tiempo',
    originalTitle: 'El eco del tiempo',
    year: 2023,
    overview: 'Un misterio a través de distintas épocas.',
    posterUrl: null,
    voteAverage: 8.6,
    voteCount: 230,
  },
  {
    source: 'tmdb',
    type: 'tv',
    tmdbId: 4,
    title: 'Ciudad invisible',
    originalTitle: 'Ciudad invisible',
    year: 2026,
    overview: 'Historias ocultas bajo una gran ciudad.',
    posterUrl: null,
    voteAverage: null,
    voteCount: null,
  },
];

export function getDemoMediaDetail(media: MediaSummary): MediaDetail | null {
  return (
    DEMO_DETAILS.find((detail) => detail.type === media.type && detail.tmdbId === media.tmdbId) ??
    null
  );
}
