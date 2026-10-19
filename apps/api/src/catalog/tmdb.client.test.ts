import { describe, expect, it, vi } from 'vitest';
import { TMDB_MAX_BODY_BYTES, createTmdbClient } from './tmdb.client.js';
import type { TmdbClientOptions, TmdbFetch, TmdbRequestInit } from './tmdb.client.js';
import type { TmdbConfig } from './tmdb.config.js';
import { TmdbError, toCatalogHttpError } from './tmdb.errors.js';

const TOKEN = 'fixture-token-abc123.not-a-real-credential';

const config: TmdbConfig = {
  readAccessToken: TOKEN,
  timeoutMs: 1000,
  language: 'es-ES',
  region: 'ES',
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function setup(
  handler: TmdbFetch,
  overrides: Partial<TmdbClientOptions> = {},
): {
  client: ReturnType<typeof createTmdbClient>;
  fetch: ReturnType<typeof vi.fn<TmdbFetch>>;
  sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
  logger: { warn: ReturnType<typeof vi.fn> };
} {
  const fetch = vi.fn<TmdbFetch>(handler);
  const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
  const logger = { warn: vi.fn() };
  const client = createTmdbClient({ config, fetch, sleep, logger, ...overrides });
  return { client, fetch, sleep, logger };
}

async function rejection(promise: Promise<unknown>): Promise<TmdbError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(TmdbError);
    return error as TmdbError;
  }
  throw new Error('Expected the promise to reject.');
}

function serialized(error: TmdbError): string {
  return JSON.stringify({
    message: error.message,
    name: error.name,
    reason: error.reason,
    http: toCatalogHttpError(error),
    stack: error.stack,
  });
}

describe('createTmdbClient — petición', () => {
  it('envía Authorization Bearer, Accept JSON, GET y redirecciones prohibidas', async () => {
    const { client, fetch } = setup(async () => json({ ok: true }));

    await expect(client.getJson(['configuration'])).resolves.toEqual({ ok: true });

    const [url, init] = fetch.mock.calls[0] as [string, TmdbRequestInit];
    expect(url).toBe('https://api.themoviedb.org/3/configuration');
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('error');
    expect(init.headers).toEqual({
      Accept: 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    });
    expect(url).not.toContain(TOKEN);
  });

  it('usa siempre HTTPS y el host fijo api.themoviedb.org', async () => {
    const { client, fetch } = setup(async () => json({}));

    await client.getJson(['search', 'movie'], { query: 'matrix' });

    const parsed = new URL(fetch.mock.calls[0]![0]);
    expect(parsed.protocol).toBe('https:');
    expect(parsed.host).toBe('api.themoviedb.org');
    expect(parsed.pathname).toBe('/3/search/movie');
  });

  it('codifica los parámetros y no permite alterar host ni ruta con la consulta', async () => {
    const { client, fetch } = setup(async () => json({}));
    const hostile = 'a&include_adult=true#frag?x=1 /../../evil.com@x';

    await client.getJson(['search', 'multi'], {
      query: hostile,
      page: 2,
      include_adult: false,
      skipped: undefined,
    });

    const parsed = new URL(fetch.mock.calls[0]![0]);
    expect(parsed.host).toBe('api.themoviedb.org');
    expect(parsed.pathname).toBe('/3/search/multi');
    expect(parsed.hash).toBe('');
    expect(parsed.searchParams.get('query')).toBe(hostile);
    expect(parsed.searchParams.get('page')).toBe('2');
    expect(parsed.searchParams.get('include_adult')).toBe('false');
    expect(parsed.searchParams.has('skipped')).toBe(false);
    expect([...parsed.searchParams.keys()].sort()).toEqual(['include_adult', 'page', 'query']);
  });

  it('construye rutas con identificadores enteros positivos', async () => {
    const { client, fetch } = setup(async () => json({}));

    await client.getJson(['movie', 603]);

    expect(fetch.mock.calls[0]![0]).toBe('https://api.themoviedb.org/3/movie/603');
  });

  it.each([
    [['..', 'evil']],
    [['movie/603']],
    [['https://evil.example']],
    [['//evil.example']],
    [['Movie']],
    [['movie', 0]],
    [['movie', -1]],
    [['movie', 1.5]],
    [['movie', Number.NaN]],
    [['movie', Number.MAX_SAFE_INTEGER + 1]],
    [[]],
  ])('rechaza segmentos de ruta peligrosos %j sin hacer peticiones', async (segments) => {
    const { client, fetch } = setup(async () => json({}));

    await expect(client.getJson(segments)).rejects.toBeInstanceOf(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rechaza nombres de parámetro no válidos y api_key', async () => {
    const { client, fetch } = setup(async () => json({}));

    await expect(client.getJson(['search', 'movie'], { 'a=b': '1' })).rejects.toBeInstanceOf(
      TypeError,
    );
    await expect(client.getJson(['search', 'movie'], { api_key: 'x' })).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('expone el idioma y la región configurados', () => {
    const { client } = setup(async () => json({}));

    expect(client.language).toBe('es-ES');
    expect(client.region).toBe('ES');
  });
});

describe('createTmdbClient — errores HTTP', () => {
  it.each([401, 403])(
    'trata %i de TMDB como indisponibilidad sin filtrar secretos',
    async (status) => {
      const { client, fetch, logger } = setup(async () =>
        json({ status_message: `Invalid API key: ${TOKEN}` }, { status }),
      );

      const error = await rejection(client.getJson(['movie', 1]));

      expect(error.kind).toBe('unavailable');
      expect(error.reason).toBe('credentials_rejected');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(toCatalogHttpError(error).statusCode).toBe(503);
      expect(serialized(error)).not.toContain(TOKEN);
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(TOKEN);
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('Invalid API key');
    },
  );

  it('traduce 404 a recurso inexistente sin reintentar', async () => {
    const { client, fetch } = setup(async () => json({ success: false }, { status: 404 }));

    const error = await rejection(client.getJson(['movie', 999999999]));

    expect(error.kind).toBe('not_found');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(toCatalogHttpError(error)).toEqual({
      statusCode: 404,
      body: { error: 'El contenido solicitado no existe.' },
    });
  });

  it('traduce otros 4xx a respuesta no válida (502) sin reintentar', async () => {
    const { client, fetch } = setup(async () => json({}, { status: 422 }));

    const error = await rejection(client.getJson(['search', 'movie']));

    expect(error.kind).toBe('invalid_response');
    expect(error.reason).toBe('unexpected_status');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(toCatalogHttpError(error).statusCode).toBe(502);
  });

  it('trata una respuesta 3xx como no válida y no sigue redirecciones', async () => {
    const { client, fetch } = setup(
      async () =>
        new Response(null, { status: 302, headers: { location: 'https://evil.example' } }),
    );

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('invalid_response');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('devuelve 429 con Retry-After largo sin reintentar', async () => {
    const { client, fetch, sleep } = setup(async () =>
      json({}, { status: 429, headers: { 'retry-after': '30' } }),
    );

    const error = await rejection(client.getJson(['search', 'movie']));

    expect(error.kind).toBe('rate_limited');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(toCatalogHttpError(error)).toMatchObject({ statusCode: 429, retryAfterSeconds: 30 });
  });

  it('reintenta una vez un 429 con Retry-After breve y se recupera', async () => {
    const responses = [json({}, { status: 429, headers: { 'retry-after': '1' } }), json({ ok: 1 })];
    const { client, fetch, sleep } = setup(async () => responses.shift()!);

    await expect(client.getJson(['movie', 1])).resolves.toEqual({ ok: 1 });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it.each([
    ['ausente', undefined],
    ['fecha HTTP', 'Wed, 21 Oct 2026 07:28:00 GMT'],
    ['negativo', '-5'],
    ['decimal', '1.5'],
    ['excesivo', '999999'],
  ])('no considera fiable un Retry-After %s y no lo reenvía', async (_label, value) => {
    const headers: Record<string, string> = value === undefined ? {} : { 'retry-after': value };
    const { client, fetch } = setup(async () => json({}, { status: 429, headers }));

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('rate_limited');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(toCatalogHttpError(error).retryAfterSeconds).toBeUndefined();
  });

  it.each([502, 503, 504])(
    'reintenta de forma acotada un %i y falla como no disponible',
    async (status) => {
      const { client, fetch, sleep } = setup(async () => json({}, { status }));

      const error = await rejection(client.getJson(['movie', 1]));

      expect(error.kind).toBe('unavailable');
      expect(error.upstreamStatus).toBe(status);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([250, 500]);
      expect(toCatalogHttpError(error).statusCode).toBe(503);
    },
  );

  it('no reintenta un 500 genérico', async () => {
    const { client, fetch } = setup(async () => json({}, { status: 500 }));

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('se recupera si un reintento tiene éxito', async () => {
    const responses = [json({}, { status: 503 }), json({ title: 'ok' })];
    const { client, fetch } = setup(async () => responses.shift()!);

    await expect(client.getJson(['movie', 1])).resolves.toEqual({ title: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('createTmdbClient — respuestas inválidas y red', () => {
  it('devuelve respuesta no válida ante JSON inválido y no reintenta', async () => {
    const { client, fetch } = setup(async () => new Response('<html>oops</html>', { status: 200 }));

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('invalid_response');
    expect(error.reason).toBe('invalid_json');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(toCatalogHttpError(error).statusCode).toBe(502);
    expect(serialized(error)).not.toContain('oops');
  });

  it('rechaza cuerpos desproporcionados', async () => {
    const { client } = setup(async () => new Response('x'.repeat(2_000_001), { status: 200 }));

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.reason).toBe('body_too_large');
  });

  it('trata errores de red como indisponibilidad con reintentos acotados y sin filtrar la causa', async () => {
    const { client, fetch, logger } = setup(async (url, init) => {
      throw new TypeError(`fetch failed ${url} ${init.headers.Authorization}`);
    });

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('unavailable');
    expect(error.reason).toBe('network');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(error.cause).toBeUndefined();
    expect(serialized(error)).not.toContain(TOKEN);
    expect(serialized(error)).not.toContain('api.themoviedb.org');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('api.themoviedb.org');
  });

  it('respeta un máximo de reintentos configurable y lo acota a 2', async () => {
    const none = setup(async () => json({}, { status: 503 }), { maxRetries: 0 });
    await rejection(none.client.getJson(['movie', 1]));
    expect(none.fetch).toHaveBeenCalledTimes(1);

    const many = setup(async () => json({}, { status: 503 }), { maxRetries: 50 });
    await rejection(many.client.getJson(['movie', 1]));
    expect(many.fetch).toHaveBeenCalledTimes(3);
  });

  it('deja de reintentar al agotar el presupuesto total de tiempo', async () => {
    let clock = 0;
    const { client, fetch } = setup(async () => json({}, { status: 503 }), {
      totalBudgetMs: 600,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });

    await rejection(client.getJson(['movie', 1]));

    // 0 → espera 250 → intento 2 → 250 + 500 ≥ 600 → se detiene.
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('createTmdbClient — timeout y abort', () => {
  it('aborta la petición al superar el timeout y devuelve TmdbTimeoutError', async () => {
    let capturedSignal: AbortSignal | undefined;
    const { client, fetch } = setup(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          capturedSignal = init.signal;
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
      { config: { ...config, timeoutMs: 20 }, maxRetries: 0 },
    );

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('timeout');
    expect(capturedSignal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(toCatalogHttpError(error)).toEqual({
      statusCode: 504,
      body: { error: 'El catálogo tardó demasiado en responder.' },
    });
  });

  it('reintenta tras un timeout y se recupera', async () => {
    let calls = 0;
    const { client, fetch } = setup(
      (_url, init) => {
        calls += 1;
        if (calls === 1) {
          return new Promise<Response>((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('x', 'AbortError')),
            );
          });
        }
        return Promise.resolve(json({ ok: true }));
      },
      { config: { ...config, timeoutMs: 20 }, totalBudgetMs: 10_000 },
    );

    await expect(client.getJson(['movie', 1])).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('trata un fallo de lectura del cuerpo como indisponibilidad', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error('stream broke'));
      },
    });
    const { client } = setup(async () => new Response(body, { status: 200 }), { maxRetries: 0 });

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('unavailable');
    expect(error.reason).toBe('network');
  });
});

describe('logs', () => {
  it('solo registra tipo, motivo, estado, intento y duración', async () => {
    const { client, logger } = setup(async () => json({}, { status: 503 }), { maxRetries: 0 });

    await rejection(client.getJson(['search', 'movie'], { query: 'consulta sensible' }));

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [fields, message] = logger.warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(Object.keys(fields).sort()).toEqual([
      'attempt',
      'durationMs',
      'tmdbErrorKind',
      'tmdbReason',
      'tmdbStatus',
    ]);
    expect(JSON.stringify([fields, message])).not.toContain('consulta sensible');
  });
});

const MAX_BYTES = TMDB_MAX_BODY_BYTES;
const encoder = new TextEncoder();

function chunkedResponse(
  chunks: Uint8Array[],
  init: ResponseInit = {},
  onCancel?: () => void,
): Response {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
    cancel() {
      onCancel?.();
    },
  });
  return new Response(stream, { status: 200, ...init });
}

describe('plazo garantizado (transportes que ignoran abort)', () => {
  it('vence el plazo con un transporte que nunca resuelve', async () => {
    const { client, fetch } = setup(() => new Promise<Response>(() => undefined), {
      config: { ...config, timeoutMs: 30 },
      maxRetries: 0,
    });

    const started = Date.now();
    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('activa el AbortController aunque el transporte lo ignore', async () => {
    let signal: AbortSignal | undefined;
    const { client } = setup(
      (_url, init) => {
        signal = init.signal;
        return new Promise<Response>(() => undefined);
      },
      { config: { ...config, timeoutMs: 20 }, maxRetries: 0 },
    );

    await rejection(client.getJson(['movie', 1]));

    expect(signal?.aborted).toBe(true);
  });

  it('descarta y cancela una respuesta tardía de un transporte que ignora abort, sin rechazos sin gestionar', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    let cancelled = false;
    try {
      const { client } = setup(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(
              () =>
                resolve(
                  chunkedResponse([encoder.encode('{"late":true}')], {}, () => {
                    cancelled = true;
                  }),
                ),
              80,
            );
          }),
        { config: { ...config, timeoutMs: 20 }, maxRetries: 0 },
      );

      const error = await rejection(client.getJson(['movie', 1]));
      expect(error.kind).toBe('timeout');

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(cancelled).toBe(true);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('cubre también la lectura del cuerpo: un cuerpo que nunca termina agota el plazo', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"a":'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { client } = setup(async () => new Response(stream, { status: 200 }), {
      config: { ...config, timeoutMs: 30 },
      maxRetries: 0,
    });

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('timeout');
    expect(cancelled).toBe(true);
  });

  it('cubre la lectura del cuerpo aunque el flujo ignore la cancelación', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => undefined),
      cancel: () => new Promise<void>(() => undefined),
    });
    const { client } = setup(async () => new Response(stream, { status: 200 }), {
      config: { ...config, timeoutMs: 30 },
      maxRetries: 0,
    });

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('timeout');
  });

  it('no reintenta cuando el presupuesto total está agotado y lo respeta como tope', async () => {
    const { client, fetch } = setup(() => new Promise<Response>(() => undefined), {
      config: { ...config, timeoutMs: 40 },
      totalBudgetMs: 50,
      sleep: undefined,
    });

    const started = Date.now();
    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('timeout');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('limita el plazo del segundo intento a lo que queda del presupuesto', async () => {
    let clock = 0;
    const deadlines: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      handler: () => void,
      ms?: number,
    ) => {
      deadlines.push(ms ?? 0);
      // El plazo simulado consume reloj lógico sin esperar de verdad.
      return realSetTimeout(() => {
        clock += ms ?? 0;
        handler();
      }, 1);
    }) as typeof setTimeout);
    const totalBudgetMs = 1100;
    let calls = 0;
    try {
      const { client } = setup(
        () => {
          calls += 1;
          return calls === 1
            ? Promise.resolve(new Response('{}', { status: 503 }))
            : new Promise<Response>(() => undefined);
        },
        {
          config: { ...config, timeoutMs: 1000 },
          totalBudgetMs,
          now: () => clock,
          sleep: async (ms) => {
            clock += ms;
          },
        },
      );
      const error = await rejection(client.getJson(['movie', 1]));
      expect(error.kind).toBe('timeout');
    } finally {
      spy.mockRestore();
    }

    // 1.er intento: 1000; backoff 250 → quedan 850 < 1000 para el 2.º intento.
    expect(calls).toBe(2);
    expect(deadlines).toEqual([1000, 850]);
    expect(clock).toBeLessThanOrEqual(totalBudgetMs);
  });

  it('no reintenta cuando el backoff agotaría el presupuesto', async () => {
    const { client, fetch } = setup(async () => new Response('{}', { status: 503 }), {
      totalBudgetMs: 200,
    });

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('límite real del tamaño de respuesta', () => {
  it('rechaza por Content-Length superior al máximo sin leer el cuerpo', async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(encoder.encode('x'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { client, fetch } = setup(
      async () =>
        new Response(stream, { status: 200, headers: { 'content-length': String(MAX_BYTES + 1) } }),
    );

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.kind).toBe('invalid_response');
    expect(error.reason).toBe('body_too_large');
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(toCatalogHttpError(error).statusCode).toBe(502);
  });

  it('acepta una respuesta válida pequeña cuyo Content-Length coincide con su tamaño real', async () => {
    const { client } = setup(
      async () => new Response('{"ok":true}', { status: 200, headers: { 'content-length': '11' } }),
    );

    await expect(client.getJson(['movie', 1])).resolves.toEqual({ ok: true });
  });

  it('sin Content-Length corta la lectura al superar el máximo y cancela el flujo', async () => {
    let pulls = 0;
    let cancelled = false;
    const chunk = new Uint8Array(64 * 1024).fill(0x31);
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const { client } = setup(async () => new Response(stream, { status: 200 }), { maxRetries: 0 });

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.reason).toBe('body_too_large');
    expect(cancelled).toBe(true);
    // Se lee como mucho el máximo más un fragmento, no un flujo ilimitado.
    expect(pulls).toBeLessThanOrEqual(Math.ceil(MAX_BYTES / chunk.byteLength) + 1);
  });

  it('un Content-Length falso no evita el límite durante la lectura', async () => {
    let cancelled = false;
    const chunk = new Uint8Array(100_000).fill(0x31);
    const { client } = setup(
      async () =>
        chunkedResponse(
          Array.from({ length: 40 }, () => chunk),
          { headers: { 'content-length': '10' } },
          () => {
            cancelled = true;
          },
        ),
      { maxRetries: 0 },
    );

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.reason).toBe('body_too_large');
    expect(cancelled).toBe(true);
  });

  it('reconstruye un JSON válido dividido en muchos fragmentos, incluso a mitad de carácter UTF-8', async () => {
    const bytes = encoder.encode('{"title":"Sueño de invierno ñ €","n":[1,2,3]}');
    const chunks = Array.from(bytes, (byte) => Uint8Array.of(byte));
    const { client } = setup(async () => chunkedResponse(chunks));

    await expect(client.getJson(['movie', 1])).resolves.toEqual({
      title: 'Sueño de invierno ñ €',
      n: [1, 2, 3],
    });
  });

  it('acepta una respuesta válida dentro del límite aunque sea grande', async () => {
    const payload = JSON.stringify({ data: 'a'.repeat(MAX_BYTES - 100) });
    const { client } = setup(async () => new Response(payload, { status: 200 }));

    const result = (await client.getJson(['movie', 1])) as { data: string };

    expect(result.data.length).toBe(MAX_BYTES - 100);
  });

  it('cuenta bytes y no caracteres: texto multibyte por encima del límite se rechaza', async () => {
    const payload = '€'.repeat(Math.ceil(MAX_BYTES / 3) + 10);
    const { client } = setup(async () => new Response(payload, { status: 200 }), { maxRetries: 0 });

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.reason).toBe('body_too_large');
  });

  it('trata una respuesta sin cuerpo como JSON inválido', async () => {
    const { client } = setup(async () => new Response(null, { status: 200 }));

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.reason).toBe('invalid_json');
  });

  it('no expone fragmentos del cuerpo remoto en errores ni logs', async () => {
    const secret = 'FRAGMENTO-REMOTO-SENSIBLE';
    const { client, logger } = setup(async () => new Response(`{"x":"${secret}`, { status: 200 }));

    const error = await rejection(client.getJson(['movie', 1]));

    expect(error.reason).toBe('invalid_json');
    expect(serialized(error)).not.toContain(secret);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(secret);

    const oversize = setup(
      async () => new Response(secret.padEnd(MAX_BYTES + 10, 'x'), { status: 200 }),
      { maxRetries: 0 },
    );
    const big = await rejection(oversize.client.getJson(['movie', 1]));
    expect(serialized(big)).not.toContain(secret);
    expect(JSON.stringify(oversize.logger.warn.mock.calls)).not.toContain(secret);
  });
});
