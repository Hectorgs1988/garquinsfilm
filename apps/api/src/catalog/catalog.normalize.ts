import type { MediaSummary, MediaType } from '@garquinsfilm/shared';
import type { MediaSearchResponse, SearchType } from '@garquinsfilm/shared';
import { TmdbInvalidResponseError } from './tmdb.errors.js';

const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w342';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nullableNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function extractYear(value: unknown): number | null {
  if (typeof value !== 'string') return null;

  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  return year >= 1888 && year <= 9999 ? year : null;
}

function posterUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(value)) {
    return null;
  }

  return `${POSTER_BASE_URL}${value}`;
}

/**
 * Normaliza un resultado individual de TMDB.
 *
 * Devuelve null para entradas que no sean películas o series,
 * o que carezcan de identidad y título válidos.
 */
export function normalizeMediaSummary(input: unknown, type: MediaType): MediaSummary | null {
  if (!isRecord(input)) return null;

  const tmdbId = positiveInteger(input.id);
  const titleField = type === 'movie' ? 'title' : 'name';
  const originalField = type === 'movie' ? 'original_title' : 'original_name';
  const dateField = type === 'movie' ? 'release_date' : 'first_air_date';

  const title = nonEmptyString(input[titleField]);
  const originalTitle = nonEmptyString(input[originalField]);

  if (tmdbId === null || title === null) return null;

  return {
    source: 'tmdb',
    type,
    tmdbId,
    title,
    originalTitle: originalTitle ?? title,
    year: extractYear(input[dateField]),
    overview: nonEmptyString(input.overview),
    posterUrl: posterUrl(input.poster_path),
    voteAverage: nullableNonNegativeNumber(input.vote_average),
    voteCount: nullableNonNegativeNumber(input.vote_count),
  };
}

/**
 * Normaliza una entrada de search/multi.
 * Descarta personas y tipos desconocidos.
 */
export function normalizeMultiSearchItem(input: unknown): MediaSummary | null {
  if (!isRecord(input)) return null;

  if (input.media_type !== 'movie' && input.media_type !== 'tv') {
    return null;
  }

  return normalizeMediaSummary(input, input.media_type);
}

/**
 * Normaliza una respuesta paginada de búsqueda de TMDB.
 *
 * Los totales representan los resultados originales de TMDB.
 * En búsquedas mixtas pueden incluir personas descartadas.
 */
export function normalizeSearchResponse(input: unknown, type: SearchType): MediaSearchResponse {
  if (!isRecord(input)) {
    throw new TmdbInvalidResponseError({
      reason: 'invalid_json',
    });
  }

  const page = positiveInteger(input.page);
  const totalPages = nullableNonNegativeNumber(input.total_pages);
  const totalResults = nullableNonNegativeNumber(input.total_results);

  if (
    page === null ||
    totalPages === null ||
    totalResults === null ||
    !Number.isSafeInteger(totalPages) ||
    !Number.isSafeInteger(totalResults) ||
    !Array.isArray(input.results)
  ) {
    throw new TmdbInvalidResponseError({
      reason: 'invalid_json',
    });
  }

  const results = input.results
    .map((item: unknown) =>
      type === 'all' ? normalizeMultiSearchItem(item) : normalizeMediaSummary(item, type),
    )
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    page,
    totalPages,
    totalResults,
    results,
  };
}
