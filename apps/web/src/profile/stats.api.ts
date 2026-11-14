import type { ProfileStatsView } from '@garquinsfilm/shared';

import { request } from '../api.js';

export async function getProfileStats(signal?: AbortSignal): Promise<ProfileStatsView> {
  return request<ProfileStatsView>('/api/me/stats', { method: 'GET', signal });
}
