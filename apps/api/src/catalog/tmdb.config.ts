import { TmdbConfigError } from './tmdb.errors.js';

export interface TmdbEnvironment {
  TMDB_READ_ACCESS_TOKEN?: string;
  TMDB_TIMEOUT_MS?: string;
  TMDB_DEFAULT_LANGUAGE?: string;
  TMDB_DEFAULT_REGION?: string;
}

export interface TmdbConfig {
  readAccessToken: string;
  timeoutMs: number;
  language: string;
  region: string;
}

export const TMDB_DEFAULT_TIMEOUT_MS = 5000;
export const TMDB_MIN_TIMEOUT_MS = 1000;
export const TMDB_MAX_TIMEOUT_MS = 15000;
export const TMDB_DEFAULT_LANGUAGE = 'es-ES';
export const TMDB_DEFAULT_REGION = 'ES';

const LANGUAGE_PATTERN = /^[a-z]{2}-[A-Z]{2}$/;
const REGION_PATTERN = /^[A-Z]{2}$/;
// Un token válido es una cadena opaca sin espacios ni caracteres de control (evita inyección de cabeceras).
const TOKEN_PATTERN = /^[\x21-\x7e]+$/;

/**
 * Lee y valida la configuración de TMDB. Se invoca solo al activar el catálogo:
 * la API arranca y autentica sin credencial TMDB. Los mensajes de error nombran
 * la variable, nunca su valor.
 */
export function getTmdbConfig(environment: TmdbEnvironment = process.env): TmdbConfig {
  const readAccessToken = environment.TMDB_READ_ACCESS_TOKEN?.trim();
  if (!readAccessToken) {
    throw new TmdbConfigError('TMDB_READ_ACCESS_TOKEN must be configured to use the catalog.', {
      reason: 'missing_token',
    });
  }
  if (!TOKEN_PATTERN.test(readAccessToken)) {
    throw new TmdbConfigError('TMDB_READ_ACCESS_TOKEN has an invalid format.', {
      reason: 'invalid_config',
    });
  }

  return {
    readAccessToken,
    timeoutMs: parseTimeout(environment.TMDB_TIMEOUT_MS),
    language: parsePattern(
      environment.TMDB_DEFAULT_LANGUAGE,
      TMDB_DEFAULT_LANGUAGE,
      LANGUAGE_PATTERN,
      'TMDB_DEFAULT_LANGUAGE must look like es-ES.',
    ),
    region: parsePattern(
      environment.TMDB_DEFAULT_REGION,
      TMDB_DEFAULT_REGION,
      REGION_PATTERN,
      'TMDB_DEFAULT_REGION must be an uppercase ISO 3166-1 code such as ES.',
    ),
  };
}

function parseTimeout(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return TMDB_DEFAULT_TIMEOUT_MS;
  }
  const trimmed = value.trim();
  const timeout = Number(trimmed);
  if (!/^[0-9]+$/.test(trimmed) || timeout < TMDB_MIN_TIMEOUT_MS || timeout > TMDB_MAX_TIMEOUT_MS) {
    throw new TmdbConfigError(
      `TMDB_TIMEOUT_MS must be an integer between ${TMDB_MIN_TIMEOUT_MS} and ${TMDB_MAX_TIMEOUT_MS}.`,
      { reason: 'invalid_config' },
    );
  }
  return timeout;
}

function parsePattern(
  value: string | undefined,
  fallback: string,
  pattern: RegExp,
  message: string,
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  if (!pattern.test(trimmed)) {
    throw new TmdbConfigError(message, { reason: 'invalid_config' });
  }
  return trimmed;
}
