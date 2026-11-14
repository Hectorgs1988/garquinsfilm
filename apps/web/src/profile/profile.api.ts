import type { ProfileUpdateInput, ProfileView } from '@garquinsfilm/shared';

import { request } from '../api.js';

export async function getProfile(signal?: AbortSignal): Promise<ProfileView> {
  return request<ProfileView>('/api/me/profile', { method: 'GET', signal });
}

export async function updateProfile(input: ProfileUpdateInput): Promise<ProfileView> {
  return request<ProfileView>('/api/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
