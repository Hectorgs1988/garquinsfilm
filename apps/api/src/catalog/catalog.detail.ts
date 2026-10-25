import type { MediaDetail, MediaType } from '@garquinsfilm/shared';

import type { TmdbClient } from './tmdb.client.js';
import { CatalogCache } from './catalog.cache.js';
import { normalizeMediaDetail } from './catalog.detail.normalize.js';

export interface CatalogDetailParams {
  type: MediaType;
  tmdbId: number;
}

export interface CatalogDetailServiceOptions {
  cache?: CatalogCache<MediaDetail>;
}

export function createCatalogDetailService(
  client: TmdbClient,
  options: CatalogDetailServiceOptions = {},
) {
  const cache = options.cache ?? new CatalogCache<MediaDetail>();

  return {
    async getDetail(params: CatalogDetailParams): Promise<MediaDetail> {
      const key = JSON.stringify([params.type, params.tmdbId, client.language, client.region]);

      return cache.getOrLoad(key, async () => {
        const response = await client.getJson([params.type, params.tmdbId], {
          language: client.language,
          append_to_response: 'credits,videos,watch/providers',
        });

        return normalizeMediaDetail(response, params.type, params.tmdbId);
      });
    },
  };
}
