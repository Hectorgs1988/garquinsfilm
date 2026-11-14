import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileStatsView } from '@garquinsfilm/shared';

const request = vi.hoisted(() => vi.fn());
vi.mock('../api.js', () => ({ request }));

import { getProfileStats } from './stats.api.js';

const stats: ProfileStatsView = {
  movies: { completed: 0, pending: 0 },
  series: { completed: 0, pending: 0 },
  ratings: { average: null, count: 0 },
};

beforeEach(() => vi.clearAllMocks());

describe('profile stats API client', () => {
  it('reads the own-stats endpoint', async () => {
    request.mockResolvedValueOnce(stats);
    expect(await getProfileStats()).toEqual(stats);
    expect(request).toHaveBeenCalledWith('/api/me/stats', { method: 'GET', signal: undefined });
  });
});
