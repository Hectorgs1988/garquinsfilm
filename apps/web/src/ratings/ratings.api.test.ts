import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RatingPutInput, RatingView } from '@garquinsfilm/shared';

const request = vi.hoisted(() => vi.fn());
vi.mock('../api.js', () => ({ request }));

import { deleteRating, getRating, putRating } from './ratings.api.js';

const rating: RatingView = {
  libraryEntryId: 'entry/1',
  score: 0,
  review: null,
  containsSpoilers: false,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
};

beforeEach(() => vi.clearAllMocks());

describe('ratings API client', () => {
  it('uses the existing HTTP client and exact private endpoint paths', async () => {
    request
      .mockResolvedValueOnce(rating)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined);
    expect(await getRating('entry/1')).toEqual(rating);
    expect(await getRating('entry/1')).toBeNull();
    await deleteRating('entry/1');
    expect(request).toHaveBeenNthCalledWith(1, '/api/library/entry%2F1/rating', { method: 'GET' });
    expect(request).toHaveBeenNthCalledWith(2, '/api/library/entry%2F1/rating', { method: 'GET' });
    expect(request).toHaveBeenNthCalledWith(3, '/api/library/entry%2F1/rating', {
      method: 'DELETE',
    });
  });

  it('sends only the shared input contract and never a user id', async () => {
    request.mockResolvedValueOnce(rating);
    const input: RatingPutInput = { score: 0, review: null, containsSpoilers: false };
    await putRating('entry-1', input);
    expect(request).toHaveBeenCalledWith('/api/library/entry-1/rating', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  });
});
