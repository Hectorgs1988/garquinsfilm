import type { LibraryListQuery } from '@garquinsfilm/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
vi.mock('../api.js', () => ({ request }));

import {
  createLibraryEntry,
  deleteLibraryEntry,
  findLibraryEntryForMedia,
  listLibrary,
  updateLibraryEntry,
} from './library.api.js';

beforeEach(() => vi.clearAllMocks());

describe('library API client', () => {
  it('serializa solo los filtros compatibles con GET /api/library', async () => {
    request.mockResolvedValueOnce({ results: [] });
    const query: LibraryListQuery = {
      type: 'tv',
      status: 'WATCHING',
      favorite: true,
      page: 2,
      pageSize: 20,
      sortBy: 'updatedAt',
      sortOrder: 'asc',
    };

    await listLibrary(query);

    expect(request).toHaveBeenCalledWith(
      '/api/library?page=2&pageSize=20&sortBy=updatedAt&sortOrder=asc&type=tv&status=WATCHING&favorite=true',
      { method: 'GET', signal: undefined },
    );
  });

  it('busca una identidad de catálogo en las páginas filtradas por tipo', async () => {
    const entry = {
      id: 'entry-2',
      source: 'tmdb',
      type: 'tv',
      tmdbId: 99,
    };
    request
      .mockResolvedValueOnce({ results: [], totalPages: 2 })
      .mockResolvedValueOnce({ results: [entry], totalPages: 2 });
    expect(await findLibraryEntryForMedia('tv', 99)).toEqual(entry);
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/library?page=1&pageSize=100&sortBy=addedAt&sortOrder=desc&type=tv',
      { method: 'GET', signal: undefined },
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/library?page=2&pageSize=100&sortBy=addedAt&sortOrder=desc&type=tv',
      { method: 'GET', signal: undefined },
    );
  });

  it('crea con la identidad únicamente y deja el estado inicial al servidor', async () => {
    request.mockResolvedValueOnce({});
    const input = { source: 'tmdb', type: 'movie', tmdbId: 812 } as const;
    await createLibraryEntry(input);

    expect(request).toHaveBeenCalledWith('/api/library', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  });

  it('actualiza y elimina utilizando el identificador de entrada codificado', async () => {
    request.mockResolvedValue({});
    await updateLibraryEntry('entry/1', { isFavorite: true });
    await deleteLibraryEntry('entry/1');

    expect(request).toHaveBeenNthCalledWith(1, '/api/library/entry%2F1', {
      method: 'PATCH',
      body: JSON.stringify({ isFavorite: true }),
    });
    expect(request).toHaveBeenNthCalledWith(2, '/api/library/entry%2F1', {
      method: 'DELETE',
    });
  });
});
