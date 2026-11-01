import type { RatingPutInput, RatingView } from '@garquinsfilm/shared';

import { request } from '../api.js';

export async function getRating(entryId: string): Promise<RatingView | null> {
  return request<RatingView | null>(`/api/library/${encodeURIComponent(entryId)}/rating`, {
    method: 'GET',
  });
}

export async function putRating(entryId: string, input: RatingPutInput): Promise<RatingView> {
  return request<RatingView>(`/api/library/${encodeURIComponent(entryId)}/rating`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteRating(entryId: string): Promise<void> {
  await request<void>(`/api/library/${encodeURIComponent(entryId)}/rating`, {
    method: 'DELETE',
  });
}
