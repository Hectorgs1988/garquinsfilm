import type { ProfileUpdateInput, ProfileView } from '@garquinsfilm/shared';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthRuntime } from '../auth/auth.js';
import profileRoutes from './profile.routes.js';
import type { ProfileRepository } from './profile.service.js';

const userId = 'profile-owner';
const trustedOrigin = 'http://127.0.0.1:5173';
const profile: ProfileView = {
  name: 'Ana',
  bio: 'Fan del cine de los 90.',
  avatar: { kind: 'initials' },
};

describe('own profile routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function createApp(
    session: 'valid' | 'none' | 'error' = 'valid',
    overrides: Partial<ProfileRepository> = {},
  ) {
    const repository: ProfileRepository = {
      find: vi.fn(async () => profile),
      update: vi.fn(async (_userId: string, input: ProfileUpdateInput) => ({
        ...profile,
        ...input,
      })),
      ...overrides,
    };
    const getSession = vi.fn();
    if (session === 'valid') getSession.mockResolvedValue({ user: { id: userId, role: 'user' } });
    if (session === 'none') getSession.mockResolvedValue(null);
    if (session === 'error') getSession.mockRejectedValue(new Error('db down'));
    const auth = { api: { getSession } } as unknown as AuthRuntime;
    const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
    app.register(profileRoutes, { auth, repository });
    apps.push(app);
    return { app, repository };
  }

  it('requires a session and sends private no-store headers', async () => {
    const { app, repository } = createApp('none');
    const get = await app.inject({ method: 'GET', url: '/api/me/profile' });
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/me/profile',
      headers: { origin: trustedOrigin },
      payload: { name: 'Ana' },
    });

    expect(get.statusCode).toBe(401);
    expect(patch.statusCode).toBe(401);
    expect(get.headers['cache-control']).toBe('private, no-store');
    expect(repository.find).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('returns 503 when the session cannot be verified', async () => {
    const { app } = createApp('error');
    const response = await app.inject({ method: 'GET', url: '/api/me/profile' });
    expect(response.statusCode).toBe(503);
  });

  it('rejects untrusted origins before touching the repository', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/me/profile',
      headers: { origin: 'https://evil.example' },
      payload: { name: 'Ana' },
    });
    expect(response.statusCode).toBe(403);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('returns the profile of the session user only', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({ method: 'GET', url: '/api/me/profile' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(profile);
    expect(response.body).not.toContain('@');
    expect(repository.find).toHaveBeenCalledExactlyOnceWith(userId);
  });

  it('returns 404 when the user no longer exists', async () => {
    const { app } = createApp('valid', { find: vi.fn(async () => null) });
    const response = await app.inject({ method: 'GET', url: '/api/me/profile' });
    expect(response.statusCode).toBe(404);
  });

  it('updates with normalized input', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/me/profile',
      headers: { origin: trustedOrigin },
      payload: { name: '  Ana López ', bio: ' Hola\r\nmundo ' },
    });

    expect(response.statusCode).toBe(200);
    expect(repository.update).toHaveBeenCalledExactlyOnceWith(userId, {
      name: 'Ana López',
      bio: 'Hola\nmundo',
    });
    expect(response.json()).toMatchObject({ name: 'Ana López', bio: 'Hola\nmundo' });
  });

  it.each([
    {},
    { email: 'otro@example.test' },
    { name: 'Ana', role: 'admin' },
    { name: '   ' },
    { name: 'x'.repeat(51) },
    { bio: 'x'.repeat(301) },
    { avatarKind: 'preset', avatarKey: 'preset-01' },
  ])('rejects invalid body %j with 400', async (payload) => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/me/profile',
      headers: { origin: trustedOrigin },
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('maps database outages to 503 without leaking details', async () => {
    const { app } = createApp('valid', {
      update: vi.fn(async () => {
        throw Object.assign(new Error('connection refused at 10.0.0.5'), { code: 'P1001' });
      }),
    });
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/me/profile',
      headers: { origin: trustedOrigin },
      payload: { bio: null },
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('10.0.0.5');
  });

  it('maps unexpected errors to 500', async () => {
    const { app } = createApp('valid', {
      find: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const response = await app.inject({ method: 'GET', url: '/api/me/profile' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Unable to complete profile request.' });
  });
});
