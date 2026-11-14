import type { ProfileStatsView } from '@garquinsfilm/shared';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthRuntime } from '../auth/auth.js';
import statsRoutes from './stats.routes.js';
import type { StatsRepository } from './stats.service.js';

const userId = 'stats-owner';
const trustedOrigin = 'http://127.0.0.1:5173';
const stats: ProfileStatsView = {
  movies: { completed: 12, pending: 3 },
  series: { completed: 4, pending: 1 },
  ratings: { average: 8.3, count: 9 },
};

describe('own stats route', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function createApp(
    session: 'valid' | 'none' | 'error' = 'valid',
    overrides: Partial<StatsRepository> = {},
  ) {
    const repository: StatsRepository = {
      summary: vi.fn(async () => stats),
      ...overrides,
    };
    const getSession = vi.fn();
    if (session === 'valid') getSession.mockResolvedValue({ user: { id: userId, role: 'user' } });
    if (session === 'none') getSession.mockResolvedValue(null);
    if (session === 'error') getSession.mockRejectedValue(new Error('db down'));
    const auth = { api: { getSession } } as unknown as AuthRuntime;
    const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
    app.register(statsRoutes, { auth, repository });
    apps.push(app);
    return { app, repository };
  }

  it('requires a session and sends private no-store headers', async () => {
    const { app, repository } = createApp('none');
    const response = await app.inject({ method: 'GET', url: '/api/me/stats' });

    expect(response.statusCode).toBe(401);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(repository.summary).not.toHaveBeenCalled();
  });

  it('returns 503 when the session cannot be verified', async () => {
    const { app } = createApp('error');
    const response = await app.inject({ method: 'GET', url: '/api/me/stats' });
    expect(response.statusCode).toBe(503);
  });

  it('rejects untrusted origins before touching the repository', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/me/stats',
      headers: { origin: 'https://evil.example' },
    });

    expect(response.statusCode).toBe(403);
    expect(repository.summary).not.toHaveBeenCalled();
  });

  it('returns the stats of the session user only', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/me/stats',
      headers: { origin: trustedOrigin },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(stats);
    expect(repository.summary).toHaveBeenCalledExactlyOnceWith(userId);
  });

  it('rejects unknown query parameters', async () => {
    const { app } = createApp();
    const response = await app.inject({ method: 'GET', url: '/api/me/stats?userId=someone-else' });
    expect(response.statusCode).toBe(400);
  });

  it('maps database outages to 503 without leaking details', async () => {
    const { app } = createApp('valid', {
      summary: vi.fn(async () => {
        throw Object.assign(new Error('connection refused at 10.0.0.5'), { code: 'P1001' });
      }),
    });
    const response = await app.inject({ method: 'GET', url: '/api/me/stats' });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('10.0.0.5');
  });

  it('maps unexpected errors to 500', async () => {
    const { app } = createApp('valid', {
      summary: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const response = await app.inject({ method: 'GET', url: '/api/me/stats' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Unable to complete stats request.' });
  });
});
