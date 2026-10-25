import type { MediaSearchResponse, SearchType } from '@garquinsfilm/shared';

import type { TmdbClient } from './tmdb.client.js';
import { normalizeSearchResponse } from './catalog.normalize.js';
import { CatalogCache, SEARCH_CACHE_MAX_ENTRIES, SEARCH_CACHE_TTL_MS } from './catalog.cache.js';

export interface CatalogSearchParams {
  query: string;
  type: SearchType;
  page: number;
}

export interface CatalogSearchServiceOptions {
  cache?: CatalogCache<MediaSearchResponse>;
}

export function createCatalogSearchService(
  client: TmdbClient,
  options: CatalogSearchServiceOptions = {},
) {
  const cache =
    options.cache ??
    new CatalogCache<MediaSearchResponse>({
      ttlMs: SEARCH_CACHE_TTL_MS,
      maxEntries: SEARCH_CACHE_MAX_ENTRIES,
    });

  return {
    async search(params: CatalogSearchParams): Promise<MediaSearchResponse> {
      // Clave independiente para cada combinación de búsqueda.
      const key = JSON.stringify([
        params.query,
        params.type,
        params.page,
        client.language,
        client.region,
      ]);

      return cache.getOrLoad(key, async () => {
        const segments = params.type === 'all' ? ['search', 'multi'] : ['search', params.type];

        const response = await client.getJson(segments, {
          query: params.query,
          page: params.page,
          language: client.language,
          include_adult: false,
          ...(params.type === 'movie' ? { region: client.region } : {}),
        });

        return normalizeSearchResponse(response, params.type);
      });
    },
  };
}
