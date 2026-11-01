import type {
  LibraryCreateInput,
  LibraryEntryView,
  LibraryListQuery,
  LibraryListResponse,
  LibraryUpdateInput,
} from '@garquinsfilm/shared';

import { request } from '../api.js';

export async function listLibrary(
  query: LibraryListQuery,
  signal?: AbortSignal,
): Promise<LibraryListResponse> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
  if (query.type) params.set('type', query.type);
  if (query.status) params.set('status', query.status);
  if (query.favorite !== undefined) params.set('favorite', String(query.favorite));

  return request<LibraryListResponse>(`/api/library?${params.toString()}`, {
    method: 'GET',
    signal,
  });
}

export async function findLibraryEntryForMedia(
  type: LibraryEntryView['type'],
  tmdbId: number,
  signal?: AbortSignal,
): Promise<LibraryEntryView | null> {
  const query: LibraryListQuery = {
    type,
    page: 1,
    pageSize: 100,
    sortBy: 'addedAt',
    sortOrder: 'desc',
  };
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await listLibrary({ ...query, page }, signal);
    const match = response.results.find(
      (entry) => entry.source === 'tmdb' && entry.type === type && entry.tmdbId === tmdbId,
    );
    if (match) return match;
    totalPages = response.totalPages;
    page += 1;
  }
  return null;
}

export async function createLibraryEntry(input: LibraryCreateInput): Promise<LibraryEntryView> {
  return request<LibraryEntryView>('/api/library', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateLibraryEntry(
  entryId: string,
  input: LibraryUpdateInput,
): Promise<LibraryEntryView> {
  return request<LibraryEntryView>(`/api/library/${encodeURIComponent(entryId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteLibraryEntry(entryId: string): Promise<void> {
  await request<void>(`/api/library/${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
  });
}
