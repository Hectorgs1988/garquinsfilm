import { describe, expect, it } from 'vitest';
import {
  TMDB_DEFAULT_TIMEOUT_MS,
  TMDB_MAX_TIMEOUT_MS,
  TMDB_MIN_TIMEOUT_MS,
  getTmdbConfig,
} from './tmdb.config.js';
import { TmdbConfigError, toCatalogHttpError } from './tmdb.errors.js';

const TOKEN = 'fixture-token-abc123.not-a-real-credential';

function configError(environment: Record<string, string | undefined>): TmdbConfigError {
  try {
    getTmdbConfig(environment);
  } catch (error) {
    expect(error).toBeInstanceOf(TmdbConfigError);
    return error as TmdbConfigError;
  }
  throw new Error('Expected getTmdbConfig to throw.');
}

describe('getTmdbConfig', () => {
  it('aplica los valores por defecto documentados', () => {
    expect(getTmdbConfig({ TMDB_READ_ACCESS_TOKEN: TOKEN })).toEqual({
      readAccessToken: TOKEN,
      timeoutMs: TMDB_DEFAULT_TIMEOUT_MS,
      language: 'es-ES',
      region: 'ES',
    });
    expect(TMDB_DEFAULT_TIMEOUT_MS).toBe(5000);
  });

  it('acepta valores explícitos válidos y recorta espacios', () => {
    expect(
      getTmdbConfig({
        TMDB_READ_ACCESS_TOKEN: `  ${TOKEN}  `,
        TMDB_TIMEOUT_MS: ' 3000 ',
        TMDB_DEFAULT_LANGUAGE: 'en-US',
        TMDB_DEFAULT_REGION: 'GB',
      }),
    ).toEqual({ readAccessToken: TOKEN, timeoutMs: 3000, language: 'en-US', region: 'GB' });
  });

  it('trata variables vacías como no configuradas', () => {
    expect(
      getTmdbConfig({
        TMDB_READ_ACCESS_TOKEN: TOKEN,
        TMDB_TIMEOUT_MS: '',
        TMDB_DEFAULT_LANGUAGE: '  ',
        TMDB_DEFAULT_REGION: '',
      }),
    ).toMatchObject({ timeoutMs: 5000, language: 'es-ES', region: 'ES' });
  });

  it.each([undefined, '', '   '])('exige el token cuando falta (%j)', (value) => {
    const error = configError({ TMDB_READ_ACCESS_TOKEN: value });

    expect(error.kind).toBe('config');
    expect(error.reason).toBe('missing_token');
    expect(toCatalogHttpError(error).statusCode).toBe(503);
  });

  it.each(['abc def', 'abc\ndef', 'abc\r\nX-Injected: 1', 'tökén', 'a\tb'])(
    'rechaza un token con espacios o caracteres de control o no ASCII (%j) sin revelarlo',
    (token) => {
      const error = configError({ TMDB_READ_ACCESS_TOKEN: token });

      expect(error.reason).toBe('invalid_config');
      expect(error.message).not.toContain(token.trim());
    },
  );

  it.each(['abc', '0', '999', '15001', '-1000', '1500.5', '1e3', '0x10', 'NaN'])(
    'rechaza TMDB_TIMEOUT_MS inválido (%s)',
    (value) => {
      const error = configError({ TMDB_READ_ACCESS_TOKEN: TOKEN, TMDB_TIMEOUT_MS: value });

      expect(error.reason).toBe('invalid_config');
    },
  );

  it('acepta los límites del timeout', () => {
    for (const value of [TMDB_MIN_TIMEOUT_MS, TMDB_MAX_TIMEOUT_MS]) {
      expect(
        getTmdbConfig({ TMDB_READ_ACCESS_TOKEN: TOKEN, TMDB_TIMEOUT_MS: String(value) }).timeoutMs,
      ).toBe(value);
    }
  });

  it.each(['es', 'es_ES', 'ES-es', 'español', 'es-ES-x'])(
    'rechaza TMDB_DEFAULT_LANGUAGE inválido (%s)',
    (value) => {
      expect(
        configError({ TMDB_READ_ACCESS_TOKEN: TOKEN, TMDB_DEFAULT_LANGUAGE: value }).reason,
      ).toBe('invalid_config');
    },
  );

  it.each(['es', 'ESP', 'E1', '1', 'España'])(
    'rechaza TMDB_DEFAULT_REGION inválido (%s)',
    (value) => {
      expect(
        configError({ TMDB_READ_ACCESS_TOKEN: TOKEN, TMDB_DEFAULT_REGION: value }).reason,
      ).toBe('invalid_config');
    },
  );

  it('nunca incluye el token en los mensajes de error', () => {
    const errors = [
      configError({ TMDB_READ_ACCESS_TOKEN: TOKEN, TMDB_TIMEOUT_MS: 'x' }),
      configError({ TMDB_READ_ACCESS_TOKEN: TOKEN, TMDB_DEFAULT_LANGUAGE: 'x' }),
      configError({ TMDB_READ_ACCESS_TOKEN: TOKEN, TMDB_DEFAULT_REGION: 'x' }),
    ];

    for (const error of errors) {
      expect(error.message).not.toContain(TOKEN);
      expect(JSON.stringify(toCatalogHttpError(error))).not.toContain(TOKEN);
    }
  });
});
