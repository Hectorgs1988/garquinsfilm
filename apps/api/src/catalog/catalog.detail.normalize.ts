import type {
  MediaCastMember,
  MediaCrewMember,
  MediaVideo,
  MediaWatchProvider,
  MediaWatchProviders,
  MediaDetail,
  MediaGenre,
  MediaType,
  MovieDetail,
  TvDetail,
  TvSeason,
} from '@garquinsfilm/shared';

import { normalizeMediaSummary } from './catalog.normalize.js';
import { TmdbInvalidResponseError } from './tmdb.errors.js';

type JsonRecord = Record<string, unknown>;

const BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/w1280';
const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w342';
const PROFILE_BASE_URL = 'https://image.tmdb.org/t/p/w185';
const LOGO_BASE_URL = 'https://image.tmdb.org/t/p/w92';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function validDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function imageUrl(value: unknown, baseUrl: string): string | null {
  if (typeof value !== 'string' || !/^\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(value)) {
    return null;
  }

  return `${baseUrl}${value}`;
}

function normalizeGenres(value: unknown): MediaGenre[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): MediaGenre[] => {
    if (!isRecord(item)) return [];

    const id = nonNegativeInteger(item.id);
    const name = optionalString(item.name);

    if (id === null || id === 0 || name === null) {
      return [];
    }

    return [{ id, name }];
  });
}

function normalizeSeasons(value: unknown): TvSeason[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): TvSeason[] => {
    if (!isRecord(item)) return [];

    const seasonNumber = nonNegativeInteger(item.season_number);
    const episodeCount = nonNegativeInteger(item.episode_count);

    if (seasonNumber === null || episodeCount === null) {
      return [];
    }

    return [
      {
        seasonNumber,
        name: optionalString(item.name) ?? `Temporada ${seasonNumber}`,
        episodeCount,
        airDate: validDate(item.air_date),
        posterUrl: imageUrl(item.poster_path, POSTER_BASE_URL),
        isSpecial: seasonNumber === 0,
      },
    ];
  });
}

function positiveInteger(value: unknown): number | null {
  const number = nonNegativeInteger(value);
  return number !== null && number > 0 ? number : null;
}

function normalizeCast(value: unknown): MediaCastMember[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  return value
    .flatMap((item): MediaCastMember[] => {
      if (!isRecord(item)) return [];
      const tmdbId = positiveInteger(item.id);
      const name = optionalString(item.name);
      if (tmdbId === null || name === null || seen.has(tmdbId)) return [];
      seen.add(tmdbId);
      return [
        {
          tmdbId,
          name,
          character: optionalString(item.character),
          profileUrl: imageUrl(item.profile_path, PROFILE_BASE_URL),
          order: nonNegativeInteger(item.order),
        },
      ];
    })
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
}

function normalizeCrew(value: unknown, job: MediaCrewMember['job']): MediaCrewMember[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  return value.flatMap((item): MediaCrewMember[] => {
    if (!isRecord(item) || (job === 'Director' && item.job !== job)) return [];
    const tmdbId = positiveInteger(item.id);
    const name = optionalString(item.name);
    if (tmdbId === null || name === null || seen.has(tmdbId)) return [];
    seen.add(tmdbId);
    return [{ tmdbId, name, job, profileUrl: imageUrl(item.profile_path, PROFILE_BASE_URL) }];
  });
}

const VIDEO_TYPES = [
  'Trailer',
  'Teaser',
  'Clip',
  'Featurette',
  'Behind the Scenes',
  'Bloopers',
] as const;

function normalizeVideos(value: unknown): MediaVideo[] {
  if (!isRecord(value) || !Array.isArray(value.results)) return [];
  const seen = new Set<string>();
  return value.results
    .flatMap((item): MediaVideo[] => {
      if (!isRecord(item)) return [];
      const id = optionalString(item.id);
      const name = optionalString(item.name);
      const key = optionalString(item.key);
      const type = VIDEO_TYPES.find((type) => type === item.type);
      if (id === null || name === null || key === null || type === undefined) return [];
      const site = item.site;
      if (site !== 'YouTube' && site !== 'Vimeo') return [];
      if (site === 'YouTube' ? !/^[a-zA-Z0-9_-]{11}$/.test(key) : !/^[1-9][0-9]{0,11}$/.test(key))
        return [];
      const identity = `${site}:${key}`;
      if (seen.has(identity)) return [];
      seen.add(identity);
      const language =
        typeof item.iso_639_1 === 'string' && /^[a-z]{2}$/.test(item.iso_639_1)
          ? item.iso_639_1
          : null;
      return [
        {
          id,
          name,
          key,
          site,
          type,
          official: item.official === true,
          language,
          url:
            site === 'YouTube'
              ? `https://www.youtube.com/watch?v=${key}`
              : `https://vimeo.com/${key}`,
          embedUrl:
            site === 'YouTube'
              ? `https://www.youtube-nocookie.com/embed/${key}`
              : `https://player.vimeo.com/video/${key}`,
        },
      ];
    })
    .sort(
      (a, b) =>
        VIDEO_TYPES.indexOf(a.type) - VIDEO_TYPES.indexOf(b.type) ||
        Number(b.official) - Number(a.official) ||
        Number(b.language === 'es') - Number(a.language === 'es') ||
        a.id.localeCompare(b.id),
    );
}

function normalizeProviders(value: unknown): MediaWatchProvider[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  return value.flatMap((item): MediaWatchProvider[] => {
    if (!isRecord(item)) return [];
    const tmdbId = positiveInteger(item.provider_id);
    const name = optionalString(item.provider_name);
    if (tmdbId === null || name === null || seen.has(tmdbId)) return [];
    seen.add(tmdbId);
    return [{ tmdbId, name, logoUrl: imageUrl(item.logo_path, LOGO_BASE_URL) }];
  });
}

function normalizeWatchProviders(
  value: unknown,
  type: MediaType,
  tmdbId: number,
): MediaWatchProviders {
  const results = isRecord(value) && isRecord(value.results) ? value.results : {};
  const es = isRecord(results.ES) ? results.ES : {};
  // No se aceptan redirecciones, URLs de proveedor ni destinos ajenos al título solicitado.
  let link: string | null = null;
  if (typeof es.link === 'string') {
    try {
      const url = new URL(es.link);
      if (
        url.origin === 'https://www.themoviedb.org' &&
        !url.username &&
        !url.password &&
        new RegExp(`^/${type}/${tmdbId}(?:-[a-zA-Z0-9_-]+)?/watch$`).test(url.pathname) &&
        url.search === '?locale=ES' &&
        !url.hash
      ) {
        link = url.href;
      }
    } catch {
      /* Enlace opcional inválido. */
    }
  }
  return {
    region: 'ES',
    attribution: 'JustWatch',
    link,
    subscription: normalizeProviders(es.flatrate),
    rent: normalizeProviders(es.rent),
    buy: normalizeProviders(es.buy),
  };
}

export function normalizeMediaDetail(
  input: unknown,
  type: MediaType,
  expectedId?: number,
): MediaDetail {
  if (!isRecord(input)) {
    throw new TmdbInvalidResponseError({
      reason: 'invalid_json',
    });
  }

  const summary = normalizeMediaSummary(input, type);

  if (!summary || (expectedId !== undefined && summary.tmdbId !== expectedId)) {
    throw new TmdbInvalidResponseError({
      reason: 'invalid_json',
    });
  }

  // Algunos recursos anexados incluyen id; si existe debe identificar el mismo título.
  for (const key of ['credits', 'videos', 'watch/providers']) {
    const resource = input[key];
    if (isRecord(resource) && 'id' in resource && resource.id !== summary.tmdbId) {
      throw new TmdbInvalidResponseError({ reason: 'invalid_json' });
    }
  }
  const credits = isRecord(input.credits) ? input.credits : {};
  const cast = normalizeCast(credits.cast);
  const videos = normalizeVideos(input.videos);
  const trailer =
    videos.find((video) => video.type === 'Trailer' || video.type === 'Teaser') ?? null;
  const watchProviders = normalizeWatchProviders(input['watch/providers'], type, summary.tmdbId);
  const genres = normalizeGenres(input.genres);
  const backdropUrl = imageUrl(input.backdrop_path, BACKDROP_BASE_URL);
  const status = optionalString(input.status);

  if (type === 'movie') {
    const movie: MovieDetail = {
      ...summary,
      type: 'movie',
      cast,
      directors: normalizeCrew(credits.crew, 'Director'),
      videos,
      trailer,
      watchProviders,
      releaseDate: validDate(input.release_date),
      runtime: positiveInteger(input.runtime),
      genres,
      status,
      backdropUrl,
      tagline: optionalString(input.tagline),
    };

    return movie;
  }

  const tv: TvDetail = {
    ...summary,
    type: 'tv',
    cast,
    creators: normalizeCrew(input.created_by, 'Creator'),
    videos,
    trailer,
    watchProviders,
    firstAirDate: validDate(input.first_air_date),
    numberOfSeasons: nonNegativeInteger(input.number_of_seasons),
    numberOfEpisodes: nonNegativeInteger(input.number_of_episodes),
    status,
    genres,
    backdropUrl,
    seasons: normalizeSeasons(input.seasons),
  };

  return tv;
}
