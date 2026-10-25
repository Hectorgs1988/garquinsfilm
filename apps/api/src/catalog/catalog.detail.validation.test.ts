import { describe, expect, it } from 'vitest';

import {
  CatalogDetailValidationError,
  validateMediaDetailParams,
} from './catalog.detail.validation.js';

describe('validateMediaDetailParams', () => {
  it('acepta un identificador válido de película', () => {
    expect(
      validateMediaDetailParams({
        type: 'movie',
        tmdbId: '603',
      }),
    ).toEqual({
      type: 'movie',
      tmdbId: 603,
    });
  });

  it('acepta un identificador válido de serie', () => {
    expect(
      validateMediaDetailParams({
        type: 'tv',
        tmdbId: '1396',
      }),
    ).toEqual({
      type: 'tv',
      tmdbId: 1396,
    });
  });

  it('acepta el identificador mínimo', () => {
    expect(
      validateMediaDetailParams({
        type: 'movie',
        tmdbId: '1',
      }),
    ).toEqual({
      type: 'movie',
      tmdbId: 1,
    });
  });

  it.each(['0', '-1', '1.5', 'abc', '', '001', ' 603 ', '1e3', '9007199254740992'])(
    'rechaza identificadores inválidos: %s',
    (tmdbId) => {
      expect(() =>
        validateMediaDetailParams({
          type: 'movie',
          tmdbId,
        }),
      ).toThrow(CatalogDetailValidationError);
    },
  );

  it.each([0, 603, null, undefined, ['603'], {}])(
    'rechaza identificadores que no son strings',
    (tmdbId) => {
      expect(() =>
        validateMediaDetailParams({
          type: 'movie',
          tmdbId,
        }),
      ).toThrow(CatalogDetailValidationError);
    },
  );

  it.each(['person', 'all', 'MOVIE', '', null, undefined])(
    'rechaza tipos de contenido inválidos',
    (type) => {
      expect(() =>
        validateMediaDetailParams({
          type,
          tmdbId: '603',
        }),
      ).toThrow(CatalogDetailValidationError);
    },
  );

  it('rechaza parámetros adicionales', () => {
    expect(() =>
      validateMediaDetailParams({
        type: 'movie',
        tmdbId: '603',
        admin: 'true',
      }),
    ).toThrow(CatalogDetailValidationError);
  });

  it.each([null, undefined, [], 'movie', 123])(
    'rechaza entradas que no son objetos válidos',
    (input) => {
      expect(() => validateMediaDetailParams(input)).toThrow(CatalogDetailValidationError);
    },
  );

  it('acepta el mayor entero seguro de JavaScript', () => {
    expect(
      validateMediaDetailParams({
        type: 'movie',
        tmdbId: String(Number.MAX_SAFE_INTEGER),
      }).tmdbId,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
});
