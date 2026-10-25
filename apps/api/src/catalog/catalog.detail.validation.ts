import type { MediaType } from '@garquinsfilm/shared';
import type { CatalogDetailParams } from './catalog.detail.js';

export class CatalogDetailValidationError extends Error {
  constructor() {
    super('Parámetros de detalle no válidos.');
    this.name = 'CatalogDetailValidationError';
  }
}

export function validateMediaDetailParams(input: unknown): CatalogDetailParams {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new CatalogDetailValidationError();
  }

  const params = input as Record<string, unknown>;

  // Solo admitimos los parámetros definidos en la ruta.
  const allowed = new Set(['type', 'tmdbId']);

  if (Object.keys(params).some((key) => !allowed.has(key))) {
    throw new CatalogDetailValidationError();
  }

  // El contenido debe ser película o serie.
  if (params.type !== 'movie' && params.type !== 'tv') {
    throw new CatalogDetailValidationError();
  }

  // Los parámetros de URL llegan como strings.
  if (typeof params.tmdbId !== 'string' || !/^[1-9]\d*$/.test(params.tmdbId)) {
    throw new CatalogDetailValidationError();
  }

  const tmdbId = Number(params.tmdbId);

  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    throw new CatalogDetailValidationError();
  }

  return {
    type: params.type as MediaType,
    tmdbId,
  };
}
