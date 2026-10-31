import { describe, expect, it } from 'vitest';
import {
  LibraryValidationError,
  validateCreateInput,
  validateEntryId,
  validateListQuery,
  validateUpdateInput,
} from './library.validation.js';

describe('library input validation', () => {
  it('accepts a valid movie or TV identity without metadata', () => {
    expect(validateCreateInput({ source: 'tmdb', type: 'movie', tmdbId: 123 })).toEqual({
      source: 'tmdb',
      type: 'movie',
      tmdbId: 123,
    });
  });

  it.each([0, -1, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1, '123'])(
    'rejects invalid external identifiers (%s)',
    (tmdbId) => {
      expect(() => validateCreateInput({ source: 'tmdb', type: 'tv', tmdbId })).toThrow(
        LibraryValidationError,
      );
    },
  );

  it('accepts the largest identifier representable by the PostgreSQL Int column', () => {
    expect(
      validateCreateInput({
        source: 'tmdb',
        type: 'movie',
        tmdbId: 2_147_483_647,
      }).tmdbId,
    ).toBe(2_147_483_647);
  });

  it('rejects unknown identity and update properties', () => {
    expect(() =>
      validateCreateInput({ source: 'tmdb', type: 'movie', tmdbId: 1, userId: 'other' }),
    ).toThrow(LibraryValidationError);
    expect(() => validateUpdateInput({ mediaId: 'other' })).toThrow(LibraryValidationError);
    expect(() => validateUpdateInput({})).toThrow(LibraryValidationError);
  });

  it('accepts only supported filters and bounded pagination', () => {
    expect(
      validateListQuery({
        type: 'tv',
        status: 'WATCHING',
        favorite: 'false',
        page: '2',
        pageSize: '100',
        sortBy: 'updatedAt',
        sortOrder: 'asc',
      }),
    ).toEqual({
      type: 'tv',
      status: 'WATCHING',
      favorite: false,
      page: 2,
      pageSize: 100,
      sortBy: 'updatedAt',
      sortOrder: 'asc',
    });
    expect(validateListQuery({})).toEqual({
      page: 1,
      pageSize: 20,
      sortBy: 'addedAt',
      sortOrder: 'desc',
    });
  });

  it.each([
    { page: '0' },
    { page: '1.2' },
    { page: '1e2' },
    { page: String(Number.MAX_SAFE_INTEGER), pageSize: '100' },
    { pageSize: '101' },
    { favorite: 'yes' },
    { unknown: 'value' },
    { status: 'watched' },
  ])('rejects an invalid list query (%o)', (query) => {
    expect(() => validateListQuery(query)).toThrow(LibraryValidationError);
  });

  it('validates path identifiers', () => {
    expect(validateEntryId('entry-1')).toBe('entry-1');
    expect(() => validateEntryId('')).toThrow(LibraryValidationError);
    expect(() => validateEntryId('x'.repeat(129))).toThrow(LibraryValidationError);
  });
});
