import {
  LIBRARY_ENTRY_STATUSES,
  type LibraryCreateInput,
  type LibraryEntryStatus,
  type LibraryListQuery,
  type LibrarySortBy,
  type LibrarySortOrder,
  type LibraryUpdateInput,
} from '@garquinsfilm/shared';

const createKeys = new Set(['source', 'type', 'tmdbId', 'status', 'isFavorite']);
const updateKeys = new Set(['status', 'isFavorite']);
const queryKeys = new Set([
  'type',
  'status',
  'favorite',
  'page',
  'pageSize',
  'sortBy',
  'sortOrder',
]);
const statuses = new Set<string>(LIBRARY_ENTRY_STATUSES);
const MAX_POSTGRES_INTEGER = 2_147_483_647;

export class LibraryValidationError extends Error {
  constructor() {
    super('Library input is invalid.');
    this.name = 'LibraryValidationError';
  }
}

export function validateCreateInput(value: unknown): LibraryCreateInput {
  if (!isRecord(value) || hasUnknownKey(value, createKeys)) {
    throw new LibraryValidationError();
  }

  if (
    value.source !== 'tmdb' ||
    (value.type !== 'movie' && value.type !== 'tv') ||
    !isPositiveSafeInteger(value.tmdbId) ||
    (value.status !== undefined && !isLibraryStatus(value.status)) ||
    (value.isFavorite !== undefined && typeof value.isFavorite !== 'boolean')
  ) {
    throw new LibraryValidationError();
  }

  return {
    source: value.source,
    type: value.type,
    tmdbId: value.tmdbId,
    ...(value.status === undefined ? {} : { status: value.status }),
    ...(value.isFavorite === undefined ? {} : { isFavorite: value.isFavorite }),
  };
}

export function validateUpdateInput(value: unknown): LibraryUpdateInput {
  if (
    !isRecord(value) ||
    Object.keys(value).length === 0 ||
    hasUnknownKey(value, updateKeys) ||
    (value.status !== undefined && !isLibraryStatus(value.status)) ||
    (value.isFavorite !== undefined && typeof value.isFavorite !== 'boolean')
  ) {
    throw new LibraryValidationError();
  }

  return {
    ...(value.status === undefined ? {} : { status: value.status }),
    ...(value.isFavorite === undefined ? {} : { isFavorite: value.isFavorite }),
  };
}

export function validateListQuery(value: unknown): LibraryListQuery {
  if (!isRecord(value) || hasUnknownKey(value, queryKeys)) {
    throw new LibraryValidationError();
  }

  const type = value.type;
  const status = value.status;
  const favorite = value.favorite;
  const page = parseInteger(value.page, 1, Number.MAX_SAFE_INTEGER, 1);
  const pageSize = parseInteger(value.pageSize, 1, 100, 20);
  const sortBy = value.sortBy === undefined ? 'addedAt' : value.sortBy;
  const sortOrder = value.sortOrder === undefined ? 'desc' : value.sortOrder;

  if (
    (type !== undefined && type !== 'movie' && type !== 'tv') ||
    (status !== undefined && !isLibraryStatus(status)) ||
    (favorite !== undefined && favorite !== 'true' && favorite !== 'false') ||
    page === null ||
    pageSize === null ||
    !Number.isSafeInteger((page - 1) * pageSize) ||
    !isSortBy(sortBy) ||
    !isSortOrder(sortOrder)
  ) {
    throw new LibraryValidationError();
  }

  return {
    ...(type === undefined ? {} : { type }),
    ...(status === undefined ? {} : { status }),
    ...(favorite === undefined ? {} : { favorite: favorite === 'true' }),
    page,
    pageSize,
    sortBy,
    sortOrder,
  };
}

export function validateEntryId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new LibraryValidationError();
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasUnknownKey(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).some((key) => !allowed.has(key));
}

function isPositiveSafeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_POSTGRES_INTEGER
  );
}

function isLibraryStatus(value: unknown): value is LibraryEntryStatus {
  return typeof value === 'string' && statuses.has(value);
}

function isSortBy(value: unknown): value is LibrarySortBy {
  return value === 'addedAt' || value === 'updatedAt';
}

function isSortOrder(value: unknown): value is LibrarySortOrder {
  return value === 'asc' || value === 'desc';
}

function parseInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  defaultValue: number,
): number | null {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}
