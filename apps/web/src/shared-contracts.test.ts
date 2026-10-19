import { describe, expect, it } from 'vitest';
import {
  CATALOG_ERROR_STATUS_CODES,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_TYPES,
} from '@garquinsfilm/shared';
import type { MediaDetail, MediaIdentity } from '@garquinsfilm/shared';

describe('consumo de @garquinsfilm/shared desde la web (Vite/Bundler)', () => {
  it('resuelve valores y tipos del paquete compilado', () => {
    const identity: MediaIdentity = { source: 'tmdb', type: 'tv', tmdbId: 1396 };
    const detail: Pick<MediaDetail, 'type'> = { type: identity.type };

    expect(detail.type).toBe('tv');
    expect(SEARCH_TYPES).toContain('all');
    expect(SEARCH_QUERY_MAX_LENGTH).toBe(100);
    expect(CATALOG_ERROR_STATUS_CODES).toEqual([400, 401, 404, 429, 502, 503, 504]);
  });
});
