import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
vi.mock('../api.js', () => ({ request }));

import {
  applySeasonBatch,
  getSeasonProgress,
  markSeasonComplete,
  markSeasonPending,
} from './seasons.api.js';

beforeEach(() => vi.clearAllMocks());

describe('seasons API client', () => {
  it('uses the private endpoints and sends no body on PUT and DELETE', async () => {
    request.mockResolvedValue(undefined);
    const controller = new AbortController();
    await getSeasonProgress('entry/1', controller.signal);
    await markSeasonComplete('entry/1', 2);
    await markSeasonPending('entry/1', 2);
    expect(request).toHaveBeenNthCalledWith(1, '/api/library/entry%2F1/seasons', {
      method: 'GET',
      signal: controller.signal,
    });
    expect(request).toHaveBeenNthCalledWith(2, '/api/library/entry%2F1/seasons/2', {
      method: 'PUT',
    });
    expect(request).toHaveBeenNthCalledWith(3, '/api/library/entry%2F1/seasons/2', {
      method: 'DELETE',
    });
  });

  it('sends only the shared batch contract, without a user id', async () => {
    request.mockResolvedValueOnce({ libraryEntryId: 'e', completedSeasons: [] });
    await applySeasonBatch('e', { complete: [1, 2] });
    expect(request).toHaveBeenCalledWith('/api/library/e/seasons', {
      method: 'PATCH',
      body: JSON.stringify({ complete: [1, 2] }),
    });
  });

  it('propagates HTTP client errors', async () => {
    request.mockRejectedValueOnce(new Error('boom'));
    await expect(markSeasonComplete('e', 1)).rejects.toThrow('boom');
  });
});
