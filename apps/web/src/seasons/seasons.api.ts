import type {
  SeasonProgressBatchInput,
  SeasonProgressItem,
  SeasonProgressView,
} from '@garquinsfilm/shared';

import { request } from '../api.js';

function seasonsPath(entryId: string): string {
  return `/api/library/${encodeURIComponent(entryId)}/seasons`;
}

export async function getSeasonProgress(
  entryId: string,
  signal?: AbortSignal,
): Promise<SeasonProgressView> {
  return request<SeasonProgressView>(seasonsPath(entryId), { method: 'GET', signal });
}

// PUT y DELETE no llevan cuerpo: el servidor rechaza un JSON vacío.
export async function markSeasonComplete(
  entryId: string,
  seasonNumber: number,
): Promise<SeasonProgressItem> {
  return request<SeasonProgressItem>(`${seasonsPath(entryId)}/${seasonNumber}`, {
    method: 'PUT',
  });
}

export async function markSeasonPending(entryId: string, seasonNumber: number): Promise<void> {
  await request<void>(`${seasonsPath(entryId)}/${seasonNumber}`, { method: 'DELETE' });
}

export async function applySeasonBatch(
  entryId: string,
  input: SeasonProgressBatchInput,
): Promise<SeasonProgressView> {
  return request<SeasonProgressView>(seasonsPath(entryId), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
