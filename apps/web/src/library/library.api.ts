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
