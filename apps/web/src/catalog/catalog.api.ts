import type { MediaDetail, MediaSearchResponse, MediaType, SearchType } from '@garquinsfilm/shared';

import { request } from '../api.js';

export interface CatalogSearchOptions {
  query: string;
  type?: SearchType;
  page?: number;
  signal?: AbortSignal;
}

export async function searchCatalog({
  query,
  type = 'all',
  page = 1,
  signal,
}: CatalogSearchOptions): Promise<MediaSearchResponse> {
  const params = new URLSearchParams({
    q: query.trim(),
    type,
    page: String(page),
  });

  return request<MediaSearchResponse>(`/api/search?${params.toString()}`, {
    method: 'GET',
    signal,
  });
}

export async function getMediaDetail(
  type: MediaType,
  tmdbId: number,
  signal?: AbortSignal,
): Promise<MediaDetail> {
  return request<MediaDetail>(`/api/media/${type}/${tmdbId}`, { method: 'GET', signal });
}
