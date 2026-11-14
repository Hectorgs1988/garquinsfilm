import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileView } from '@garquinsfilm/shared';

const request = vi.hoisted(() => vi.fn());
vi.mock('../api.js', () => ({ request }));

import { getProfile, updateProfile } from './profile.api.js';

const profile: ProfileView = {
  name: 'Ada',
  bio: null,
  avatar: { kind: 'initials' },
};

beforeEach(() => vi.clearAllMocks());

describe('profile API client', () => {
  it('reads the own-profile endpoint', async () => {
    request.mockResolvedValueOnce(profile);
    expect(await getProfile()).toEqual(profile);
    expect(request).toHaveBeenCalledWith('/api/me/profile', {
      method: 'GET',
      signal: undefined,
    });
  });

  it('sends only the shared contract, never a user id', async () => {
    request.mockResolvedValueOnce(profile);
    await updateProfile({ name: 'Ada', bio: null });
    expect(request).toHaveBeenCalledWith('/api/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Ada', bio: null }),
    });
  });
});
