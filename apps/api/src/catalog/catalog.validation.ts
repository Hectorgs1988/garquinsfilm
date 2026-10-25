import {
  SEARCH_DEFAULT_TYPE,
  SEARCH_PAGE_MAX,
  SEARCH_PAGE_MIN,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
} from '@garquinsfilm/shared';

import type { SearchType } from '@garquinsfilm/shared';
import type { CatalogSearchParams } from './catalog.search.js';

type QueryRecord = Record<string, unknown>;

export class CatalogValidationError extends Error {
  constructor() {
    super('Parámetros de búsqueda no válidos.');
    this.name = 'CatalogValidationError';
  }
}

export function validateSearchParams(input: unknown): CatalogSearchParams {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new CatalogValidationError();
  }

  const query = input as QueryRecord;
  const allowed = new Set(['q', 'type', 'page']);

  if (Object.keys(query).some((key) => !allowed.has(key))) {
    throw new CatalogValidationError();
  }

  if (typeof query.q !== 'string') {
    throw new CatalogValidationError();
  }

  const q = query.q.trim();

  if (q.length < SEARCH_QUERY_MIN_LENGTH || q.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new CatalogValidationError();
  }

  const type: SearchType =
    query.type === undefined
      ? SEARCH_DEFAULT_TYPE
      : query.type === 'movie' || query.type === 'tv' || query.type === 'all'
        ? query.type
        : (() => {
            throw new CatalogValidationError();
          })();

  let page = 1;

  if (query.page !== undefined) {
    if (typeof query.page !== 'string' || !/^[1-9]\d*$/.test(query.page)) {
      throw new CatalogValidationError();
    }

    page = Number(query.page);

    if (!Number.isSafeInteger(page) || page < SEARCH_PAGE_MIN || page > SEARCH_PAGE_MAX) {
      throw new CatalogValidationError();
    }
  }

  return {
    query: q,
    type,
    page,
  };
}
