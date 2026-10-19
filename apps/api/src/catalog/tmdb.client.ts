import type { TmdbConfig } from './tmdb.config.js';
import {
  TmdbInvalidResponseError,
  TmdbNotFoundError,
  TmdbRateLimitError,
  TmdbTimeoutError,
  TmdbUnavailableError,
} from './tmdb.errors.js';
import type { TmdbError } from './tmdb.errors.js';

// Host, esquema y versión fijos: no existe configuración de URL base ni se acepta ninguna URL externa.
const TMDB_ORIGIN = 'https://api.themoviedb.org';
const TMDB_BASE_PATH = '/3';

export const TMDB_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 250;
const MAX_RETRY_AFTER_SECONDS = 3600;
// Un 429 solo se reintenta si TMDB pide una espera breve.
const MAX_RETRYABLE_RETRY_AFTER_SECONDS = 2;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
// Límite en bytes recibidos (las respuestas habituales de TMDB son de decenas de KB).
export const TMDB_MAX_BODY_BYTES = 2_000_000;

const SEGMENT_PATTERN = /^[a-z][a-z_]*$/;
const QUERY_KEY_PATTERN = /^[a-z][a-z_]*$/;

export type TmdbPathSegment = string | number;
export type TmdbQueryValue = string | number | boolean | undefined;
export type TmdbQuery = Readonly<Record<string, TmdbQueryValue>>;

export interface TmdbRequestInit {
  method: 'GET';
  headers: Record<string, string>;
  signal: AbortSignal;
  redirect: 'error';
}

/** Transporte inyectable; compatible con `fetch`. Los tests proporcionan una versión simulada. */
export type TmdbFetch = (url: string, init: TmdbRequestInit) => Promise<Response>;

/** Subconjunto del logger de Fastify. Solo recibe campos no sensibles. */
export interface TmdbLogger {
  warn(fields: Record<string, unknown>, message: string): void;
}

export interface TmdbClient {
  readonly language: string;
  readonly region: string;
  /**
   * GET sobre `https://api.themoviedb.org/3/<segments>`. Los segmentos son nombres
   * estáticos (`search`, `movie`) o enteros positivos; el JSON devuelto no está validado.
   */
  getJson(segments: readonly TmdbPathSegment[], query?: TmdbQuery): Promise<unknown>;
}

export interface TmdbClientOptions {
  config: TmdbConfig;
  fetch?: TmdbFetch;
  logger?: TmdbLogger;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  /** Se acota a 0–2. */
  maxRetries?: number;
  /** Presupuesto total por llamada, reintentos incluidos. Por defecto, el doble del timeout. */
  totalBudgetMs?: number;
}

export function createTmdbClient(options: TmdbClientOptions): TmdbClient {
  const { config } = options;
  const send: TmdbFetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const maxRetries = Math.min(Math.max(Math.trunc(options.maxRetries ?? TMDB_MAX_RETRIES), 0), 2);
  const totalBudgetMs = options.totalBudgetMs ?? config.timeoutMs * 2;

  async function perform(url: string, signal: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await send(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${config.readAccessToken}`,
        },
        signal,
        redirect: 'error',
      });
    } catch {
      // No se conserva la causa: puede incluir la URL o cabeceras.
      throw signal.aborted
        ? new TmdbTimeoutError()
        : new TmdbUnavailableError({ reason: 'network' });
    }

    // Respuesta tardía de un transporte que ignoró el abort: se libera y se descarta.
    if (signal.aborted) {
      await discardBody(response);
      throw new TmdbTimeoutError();
    }
    return interpret(response, signal);
  }

  /**
   * Un intento con plazo garantizado: la operación (fetch + lectura del cuerpo) compite con
   * un temporizador. El AbortController se activa al vencer el plazo, pero el resultado no
   * depende de que el transporte lo respete.
   */
  async function attemptOnce(url: string, deadlineMs: number): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new TmdbTimeoutError());
      }, deadlineMs);
    });
    const operation = perform(url, controller.signal);
    // Si el plazo vence primero, un rechazo posterior de la operación queda controlado aquí.
    operation.catch(() => undefined);

    try {
      return await Promise.race([operation, deadline]);
    } finally {
      clearTimeout(timer);
      // Libera conexión y lector si siguen activos (también tras éxito o error).
      controller.abort();
    }
  }

  return {
    language: config.language,
    region: config.region,
    async getJson(segments, query) {
      const url = buildUrl(segments, query);
      const startedAt = now();

      for (let attempt = 0; ; attempt += 1) {
        // El plazo de cada intento nunca supera lo que queda del presupuesto total.
        const remainingMs = totalBudgetMs - (now() - startedAt);
        try {
          if (remainingMs <= 0) {
            throw new TmdbTimeoutError();
          }
          return await attemptOnce(url, Math.min(config.timeoutMs, remainingMs));
        } catch (error) {
          const tmdbError = error as TmdbError;
          const delay = retryDelay(tmdbError, attempt);
          options.logger?.warn(
            {
              tmdbErrorKind: tmdbError.kind,
              tmdbReason: tmdbError.reason,
              tmdbStatus: tmdbError.upstreamStatus,
              attempt: attempt + 1,
              durationMs: now() - startedAt,
            },
            'TMDB request failed.',
          );
          if (
            delay === undefined ||
            attempt >= maxRetries ||
            now() - startedAt + delay >= totalBudgetMs
          ) {
            throw error;
          }
          await sleep(delay);
        }
      }
    },
  };
}

function buildUrl(segments: readonly TmdbPathSegment[], query: TmdbQuery = {}): string {
  if (segments.length === 0) {
    throw new TypeError('TMDB path requires at least one segment.');
  }
  const path = segments
    .map((segment) => {
      if (typeof segment === 'number') {
        if (!Number.isSafeInteger(segment) || segment < 1) {
          throw new TypeError('TMDB numeric path segments must be positive integers.');
        }
        return String(segment);
      }
      if (!SEGMENT_PATTERN.test(segment)) {
        throw new TypeError('TMDB path segments must be static lowercase names.');
      }
      return segment;
    })
    .join('/');

  const url = new URL(`${TMDB_ORIGIN}${TMDB_BASE_PATH}/${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (!QUERY_KEY_PATTERN.test(key) || key === 'api_key') {
      throw new TypeError('Invalid TMDB query parameter name.');
    }
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  if (url.origin !== TMDB_ORIGIN || !url.pathname.startsWith(`${TMDB_BASE_PATH}/`)) {
    throw new TypeError('TMDB URL must target the fixed TMDB API host.');
  }
  return url.toString();
}

async function interpret(response: Response, signal: AbortSignal): Promise<unknown> {
  const { status } = response;

  if (status >= 200 && status < 300) {
    const bytes = await readBoundedBody(response, signal);
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw new TmdbInvalidResponseError({ reason: 'invalid_json', upstreamStatus: status });
    }
  }

  await discardBody(response);

  if (status === 401 || status === 403) {
    throw new TmdbUnavailableError({ reason: 'credentials_rejected', upstreamStatus: status });
  }
  if (status === 404) {
    throw new TmdbNotFoundError();
  }
  if (status === 429) {
    throw new TmdbRateLimitError(parseRetryAfter(response.headers.get('retry-after')));
  }
  if (status >= 500) {
    throw new TmdbUnavailableError({ reason: 'upstream_status', upstreamStatus: status });
  }
  throw new TmdbInvalidResponseError({ reason: 'unexpected_status', upstreamStatus: status });
}

/**
 * Lee el cuerpo por fragmentos con un acumulador acotado a TMDB_MAX_BODY_BYTES. Se rechaza
 * por `Content-Length` sin leer nada y, sin él (o si miente), se cancela la lectura en el
 * fragmento que supera el límite. Nunca se construye una cadena antes de validar el tamaño.
 */
async function readBoundedBody(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  const status = response.status;
  const tooLarge = () =>
    new TmdbInvalidResponseError({ reason: 'body_too_large', upstreamStatus: status });

  const declared = response.headers.get('content-length')?.trim();
  if (
    declared !== undefined &&
    /^[0-9]{1,15}$/.test(declared) &&
    Number(declared) > TMDB_MAX_BODY_BYTES
  ) {
    await discardBody(response);
    throw tooLarge();
  }

  if (!response.body) {
    return new Uint8Array(0);
  }

  const reader = response.body.getReader();
  const cancelReader = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener('abort', cancelReader, { once: true });

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch {
        throw signal.aborted
          ? new TmdbTimeoutError()
          : new TmdbUnavailableError({ reason: 'network' });
      }
      if (signal.aborted) {
        throw new TmdbTimeoutError();
      }
      if (result.done) {
        break;
      }
      received += result.value.byteLength;
      if (received > TMDB_MAX_BODY_BYTES) {
        cancelReader();
        throw tooLarge();
      }
      chunks.push(result.value);
    }
  } finally {
    signal.removeEventListener('abort', cancelReader);
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // El cuerpo de un error no se utiliza.
  }
}

// Solo se admite la forma de segundos enteros; una fecha HTTP o un valor absurdo no se considera fiable.
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^[0-9]{1,5}$/.test(value.trim())) {
    return undefined;
  }
  const seconds = Number(value.trim());
  return seconds <= MAX_RETRY_AFTER_SECONDS ? seconds : undefined;
}

function retryDelay(error: TmdbError, attempt: number): number | undefined {
  const backoff = RETRY_BASE_DELAY_MS * 2 ** attempt;

  if (error.kind === 'timeout') {
    return backoff;
  }
  if (error.kind === 'unavailable') {
    const retryable =
      error.reason === 'network' ||
      (error.reason === 'upstream_status' &&
        error.upstreamStatus !== undefined &&
        RETRYABLE_STATUSES.has(error.upstreamStatus));
    return retryable ? backoff : undefined;
  }
  if (error.kind === 'rate_limited') {
    const { retryAfterSeconds } = error as TmdbRateLimitError;
    if (retryAfterSeconds !== undefined && retryAfterSeconds <= MAX_RETRYABLE_RETRY_AFTER_SECONDS) {
      return Math.max(retryAfterSeconds * 1000, backoff);
    }
  }
  return undefined;
}
