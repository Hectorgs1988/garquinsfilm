import { describe, expect, it, vi } from 'vitest';
import {
  CatalogCache,
  CatalogCacheBusyError,
  SEARCH_CACHE_MAX_ENTRIES,
  SEARCH_CACHE_TTL_MS,
} from './catalog.cache.js';

describe('CatalogCache', () => {
  it('utiliza los límites aprobados para búsquedas', () => {
    expect(SEARCH_CACHE_TTL_MS).toBe(300_000);
    expect(SEARCH_CACHE_MAX_ENTRIES).toBe(500);
  });

  it('devuelve un valor almacenado antes de caducar', () => {
    let now = 0;
    const cache = new CatalogCache<string>({
      ttlMs: 1000,
      now: () => now,
    });

    cache.set('matrix', 'resultado');

    now = 999;
    expect(cache.get('matrix')).toBe('resultado');
  });

  it('elimina un valor cuando alcanza su TTL', () => {
    let now = 0;
    const cache = new CatalogCache<string>({
      ttlMs: 1000,
      now: () => now,
    });

    cache.set('matrix', 'resultado');

    now = 1000;

    expect(cache.get('matrix')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('expulsa la entrada menos recientemente utilizada', () => {
    const cache = new CatalogCache<string>({
      maxEntries: 2,
    });

    cache.set('a', 'A');
    cache.set('b', 'B');

    // Acceder a A la convierte en la más reciente.
    expect(cache.get('a')).toBe('A');

    cache.set('c', 'C');

    expect(cache.get('a')).toBe('A');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe('C');
    expect(cache.size).toBe(2);
  });

  it('reutiliza una respuesta sin ejecutar de nuevo el loader', async () => {
    const cache = new CatalogCache<string>();
    const loader = vi.fn().mockResolvedValue('Matrix');

    expect(await cache.getOrLoad('matrix', loader)).toBe('Matrix');
    expect(await cache.getOrLoad('matrix', loader)).toBe('Matrix');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('comparte una operación entre peticiones simultáneas', async () => {
    const cache = new CatalogCache<string>();

    let resolveLoader!: (value: string) => void;

    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoader = resolve;
        }),
    );

    const first = cache.getOrLoad('matrix', loader);
    const second = cache.getOrLoad('matrix', loader);

    // Dejar que comience el loader.
    await Promise.resolve();

    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoader('resultado');

    expect(await Promise.all([first, second])).toEqual(['resultado', 'resultado']);
  });

  it('no devuelve una entrada caducada si falla el loader', async () => {
    let now = 0;
    const cache = new CatalogCache<string>({
      ttlMs: 1000,
      now: () => now,
    });

    cache.set('matrix', 'resultado antiguo');

    now = 1001;

    const error = new Error('TMDB unavailable');
    const loader = vi.fn().mockRejectedValue(error);

    await expect(cache.getOrLoad('matrix', loader)).rejects.toBe(error);

    expect(cache.get('matrix')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('permite reintentar después de un fallo', async () => {
    const cache = new CatalogCache<string>();

    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('fallo temporal'))
      .mockResolvedValueOnce('resultado correcto');

    await expect(cache.getOrLoad('matrix', loader)).rejects.toThrow('fallo temporal');

    expect(await cache.getOrLoad('matrix', loader)).toBe('resultado correcto');

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('mantiene entradas independientes para distintas claves', async () => {
    const cache = new CatalogCache<number>();

    await cache.getOrLoad('movie:matrix', async () => 1);
    await cache.getOrLoad('tv:matrix', async () => 2);

    expect(cache.get('movie:matrix')).toBe(1);
    expect(cache.get('tv:matrix')).toBe(2);
  });

  it('rechaza configuraciones inválidas', () => {
    expect(() => new CatalogCache({ ttlMs: 0 })).toThrow();
    expect(() => new CatalogCache({ ttlMs: -100 })).toThrow();
    expect(() => new CatalogCache({ maxEntries: 0 })).toThrow();
    expect(() => new CatalogCache({ maxEntries: 1.5 })).toThrow();
  });

  it('permite vaciar las entradas almacenadas', () => {
    const cache = new CatalogCache<string>();

    cache.set('a', 'A');
    cache.set('b', 'B');

    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('limita las operaciones pendientes sin bloquear consultas idénticas', async () => {
    const cache = new CatalogCache<string>({
      maxPending: 2,
    });

    const resolvers: Array<(value: string) => void> = [];

    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const first = cache.getOrLoad('matrix', loader);
    const second = cache.getOrLoad('dune', loader);

    // Esta búsqueda reutiliza la primera operación.
    const repeated = cache.getOrLoad('matrix', loader);

    // Una tercera búsqueda diferente supera el límite.
    await expect(cache.getOrLoad('alien', loader)).rejects.toBeInstanceOf(CatalogCacheBusyError);

    await Promise.resolve();

    expect(loader).toHaveBeenCalledTimes(2);

    resolvers[0]!('Matrix');
    resolvers[1]!('Dune');

    expect(await Promise.all([first, second, repeated])).toEqual(['Matrix', 'Dune', 'Matrix']);

    // Cuando terminan, vuelve a haber capacidad.
    expect(await cache.getOrLoad('alien', async () => 'Alien')).toBe('Alien');
  });
});
