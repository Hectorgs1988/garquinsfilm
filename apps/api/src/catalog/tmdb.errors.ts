import type { ApiErrorBody, CatalogErrorStatusCode } from '@garquinsfilm/shared';

export type TmdbErrorKind =
  'config' | 'not_found' | 'rate_limited' | 'invalid_response' | 'unavailable' | 'timeout';

/**
 * Motivo interno, solo para diagnóstico y logs. Nunca se envía al cliente
 * y no puede contener datos de la petición ni la credencial.
 */
export type TmdbErrorReason =
  | 'missing_token'
  | 'invalid_config'
  | 'credentials_rejected'
  | 'upstream_status'
  | 'network'
  | 'invalid_json'
  | 'unexpected_status'
  | 'body_too_large';

export interface TmdbErrorOptions {
  reason?: TmdbErrorReason;
  upstreamStatus?: number;
}

export abstract class TmdbError extends Error {
  abstract readonly kind: TmdbErrorKind;
  readonly reason?: TmdbErrorReason;
  readonly upstreamStatus?: number;

  constructor(message: string, options: TmdbErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.reason = options.reason;
    this.upstreamStatus = options.upstreamStatus;
  }
}

export class TmdbConfigError extends TmdbError {
  readonly kind = 'config';
}

export class TmdbNotFoundError extends TmdbError {
  readonly kind = 'not_found';

  constructor() {
    super('TMDB resource not found.', { upstreamStatus: 404 });
  }
}

export class TmdbRateLimitError extends TmdbError {
  readonly kind = 'rate_limited';
  /** Solo presente cuando TMDB envió un `Retry-After` interpretable y acotado. */
  readonly retryAfterSeconds?: number;

  constructor(retryAfterSeconds?: number) {
    super('TMDB rate limit reached.', { upstreamStatus: 429 });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class TmdbInvalidResponseError extends TmdbError {
  readonly kind = 'invalid_response';

  constructor(options: TmdbErrorOptions = {}) {
    super('TMDB returned an invalid response.', options);
  }
}

export class TmdbUnavailableError extends TmdbError {
  readonly kind = 'unavailable';

  constructor(options: TmdbErrorOptions = {}) {
    super('TMDB is unavailable.', options);
  }
}

export class TmdbTimeoutError extends TmdbError {
  readonly kind = 'timeout';

  constructor() {
    super('TMDB request timed out.');
  }
}

export interface CatalogHttpError {
  statusCode: CatalogErrorStatusCode;
  body: ApiErrorBody;
  /** Valor para la cabecera `Retry-After` (segundos), solo en 429 y si es fiable. */
  retryAfterSeconds?: number;
}

const PUBLIC_MESSAGES = {
  not_found: 'El contenido solicitado no existe.',
  rate_limited: 'Demasiadas peticiones al catálogo. Inténtalo de nuevo más tarde.',
  invalid_response: 'El catálogo devolvió una respuesta no válida.',
  unavailable: 'El catálogo no está disponible temporalmente.',
  timeout: 'El catálogo tardó demasiado en responder.',
} as const;

/**
 * Traduce un error del cliente TMDB al error HTTP público de GarquinsFilm
 * (docs/API_INTEGRATION.md). Los fallos de configuración y credenciales se
 * presentan como indisponibilidad (503) sin revelar la causa.
 */
export function toCatalogHttpError(error: TmdbError): CatalogHttpError {
  switch (error.kind) {
    case 'not_found':
      return { statusCode: 404, body: { error: PUBLIC_MESSAGES.not_found } };
    case 'rate_limited':
      return {
        statusCode: 429,
        body: { error: PUBLIC_MESSAGES.rate_limited },
        retryAfterSeconds: (error as TmdbRateLimitError).retryAfterSeconds,
      };
    case 'invalid_response':
      return { statusCode: 502, body: { error: PUBLIC_MESSAGES.invalid_response } };
    case 'timeout':
      return { statusCode: 504, body: { error: PUBLIC_MESSAGES.timeout } };
    case 'config':
    case 'unavailable':
      return { statusCode: 503, body: { error: PUBLIC_MESSAGES.unavailable } };
  }
}
