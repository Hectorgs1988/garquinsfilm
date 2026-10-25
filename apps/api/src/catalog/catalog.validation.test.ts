import { describe, expect, it } from 'vitest';
import { CatalogValidationError, validateSearchParams } from './catalog.validation.js';

describe('Catalog search validation', () => {
  it('acepta una búsqueda válida', () => {
    expect(
      validateSearchParams({
        q: 'Interstellar',
        type: 'movie',
        page: '2',
      }),
    ).toEqual({
      query: 'Interstellar',
      type: 'movie',
      page: 2,
    });
  });

  it('aplica valores por defecto y elimina espacios exteriores', () => {
    expect(validateSearchParams({ q: '  Breaking Bad  ' })).toEqual({
      query: 'Breaking Bad',
      type: 'all',
      page: 1,
    });
  });

  it.each(['', '   ', 'x'.repeat(101)])('rechaza consultas vacías o demasiado largas', (q) => {
    expect(() => validateSearchParams({ q })).toThrow(CatalogValidationError);
  });

  it.each(['person', 'MOVIE', '', 123, null])('rechaza tipos no admitidos', (type) => {
    expect(() => validateSearchParams({ q: 'Matrix', type })).toThrow(CatalogValidationError);
  });

  it.each(['0', '-1', '501', '1.5', 'abc', '01', 2, null, ''])(
    'rechaza páginas inválidas',
    (page) => {
      expect(() => validateSearchParams({ q: 'Matrix', page })).toThrow(CatalogValidationError);
    },
  );

  it('acepta la página máxima permitida', () => {
    expect(validateSearchParams({ q: 'Matrix', page: '500' }).page).toBe(500);
  });

  it('rechaza parámetros desconocidos', () => {
    expect(() => validateSearchParams({ q: 'Matrix', admin: 'true' })).toThrow(
      CatalogValidationError,
    );
  });

  it('rechaza parámetros repetidos representados como arrays', () => {
    expect(() => validateSearchParams({ q: ['Matrix', 'Dune'] })).toThrow(CatalogValidationError);

    expect(() => validateSearchParams({ q: 'Matrix', page: ['1', '2'] })).toThrow(
      CatalogValidationError,
    );
  });

  it('rechaza entradas que no son objetos válidos', () => {
    expect(() => validateSearchParams(null)).toThrow(CatalogValidationError);

    expect(() => validateSearchParams([])).toThrow(CatalogValidationError);
  });

  it('conserva caracteres especiales válidos en la búsqueda', () => {
    expect(validateSearchParams({ q: '  Spider-Man: No Way Home  ' }).query).toBe(
      'Spider-Man: No Way Home',
    );
  });
});
