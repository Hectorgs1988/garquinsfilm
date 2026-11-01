import type { SeasonProgressView } from '@garquinsfilm/shared';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthRuntime } from '../auth/auth.js';
import seasonProgressRoutes from './season-progress.routes.js';
import type { SeasonProgressRepository } from './season-progress.service.js';

const userId = 'season-owner';
const view: SeasonProgressView = {
  libraryEntryId: 'owned-entry',
  completedSeasons: [{ seasonNumber: 1, completedAt: '2026-11-01T17:00:00.000Z' }],
};
const trustedOrigin = 'http://127.0.0.1:5173';

describe('season progress routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function createApp(authenticated = true, overrides: Partial<SeasonProgressRepository> = {}) {
    const repository: SeasonProgressRepository = {
      list: vi.fn(async () => ({ kind: 'ok', value: view }) as const),
      complete: vi.fn(
        async () =>
          ({ kind: 'ok', value: { season: view.completedSeasons[0], created: true } }) as const,
      ),
      uncomplete: vi.fn(async () => ({ kind: 'ok', value: null }) as const),
      applyBatch: vi.fn(async () => ({ kind: 'ok', value: view }) as const),
      ...overrides,
    };
    const auth = {
      api: {
        getSession: vi
          .fn()
          .mockResolvedValue(authenticated ? { user: { id: userId, role: 'user' } } : null),
      },
    } as unknown as AuthRuntime;
    const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
    app.register(seasonProgressRoutes, { auth, repository });
    apps.push(app);
    return { app, repository, auth };
  }

  it('requires a session on every route and never reaches the repository', async () => {
    const { app, repository } = createApp(false);
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/api/library/e/seasons' }),
      app.inject({ method: 'PUT', url: '/api/library/e/seasons/1' }),
      app.inject({ method: 'DELETE', url: '/api/library/e/seasons/1' }),
      app.inject({ method: 'PATCH', url: '/api/library/e/seasons', payload: { complete: [1] } }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([401, 401, 401, 401]);
    for (const response of responses) {
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.complete).not.toHaveBeenCalled();
    expect(repository.uncomplete).not.toHaveBeenCalled();
    expect(repository.applyBatch).not.toHaveBeenCalled();
  });

  it('lists completed seasons using only the session user id', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/library/owned-entry/seasons',
      headers: { origin: trustedOrigin },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(view);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(repository.list).toHaveBeenCalledWith(userId, 'owned-entry');
  });

  it('returns 201 when a season is created and 200 when it was already completed', async () => {
    const { app, repository } = createApp();
    const created = await app.inject({ method: 'PUT', url: '/api/library/owned-entry/seasons/0' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual(view.completedSeasons[0]);
    expect(repository.complete).toHaveBeenCalledWith(userId, 'owned-entry', 0);

    const repeated = createApp(true, {
      complete: vi.fn(
        async () =>
          ({ kind: 'ok', value: { season: view.completedSeasons[0], created: false } }) as const,
      ),
    });
    const second = await repeated.app.inject({
      method: 'PUT',
      url: '/api/library/owned-entry/seasons/9999',
    });
    expect(second.statusCode).toBe(200);
  });

  it('returns 204 without a body when deleting, even if already pending', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/library/owned-entry/seasons/3',
    });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(repository.uncomplete).toHaveBeenCalledWith(userId, 'owned-entry', 3);
  });

  it('applies a validated batch and returns the final list', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/library/owned-entry/seasons',
      payload: { complete: [1, 2], uncomplete: [4] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(view);
    expect(repository.applyBatch).toHaveBeenCalledWith(userId, 'owned-entry', {
      complete: [1, 2],
      uncomplete: [4],
    });
  });

  it.each(['-1', '01', '1.5', '1e2', '10000', 'abc', '%2B1'])(
    'rejects season number %s with 400 before touching storage',
    async (seasonNumber) => {
      const { app, repository } = createApp();
      for (const method of ['PUT', 'DELETE'] as const) {
        const response = await app.inject({
          method,
          url: `/api/library/owned-entry/seasons/${seasonNumber}`,
        });
        expect(response.statusCode).toBe(400);
      }
      expect(repository.complete).not.toHaveBeenCalled();
      expect(repository.uncomplete).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['empty object', {}],
    ['empty lists', { complete: [], uncomplete: [] }],
    ['unknown property', { complete: [1], userId: 'attacker' }],
    ['client completedAt', { complete: [1], completedAt: '2020-01-01T00:00:00.000Z' }],
    ['string season', { complete: ['1'] }],
    ['duplicates', { complete: [1, 1] }],
    ['overlap', { complete: [1], uncomplete: [1] }],
    ['too many', { complete: Array.from({ length: 101 }, (_, index) => index) }],
    ['non array', { complete: 1 }],
  ])('rejects an invalid batch (%s) with 400', async (_label, payload) => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/library/owned-entry/seasons',
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(repository.applyBatch).not.toHaveBeenCalled();
  });

  it('rejects missing, malformed and oversized batch bodies', async () => {
    const { app, repository } = createApp();
    const missing = await app.inject({ method: 'PATCH', url: '/api/library/e/seasons' });
    const malformed = await app.inject({
      method: 'PATCH',
      url: '/api/library/e/seasons',
      headers: { 'content-type': 'application/json' },
      payload: '{"complete":',
    });
    const oversized = await app.inject({
      method: 'PATCH',
      url: '/api/library/e/seasons',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ complete: [1], padding: 'x'.repeat(5000) }),
    });
    expect(missing.statusCode).toBe(400);
    expect(malformed.statusCode).toBe(400);
    expect(oversized.statusCode).toBe(413);
    expect(repository.applyBatch).not.toHaveBeenCalled();
  });

  it('rejects unknown query parameters', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/library/owned-entry/seasons?userId=other',
    });
    expect(response.statusCode).toBe(400);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('returns the same generic 404 for missing or foreign entries', async () => {
    const { app } = createApp(true, {
      list: vi.fn(async () => ({ kind: 'not_found' }) as const),
      complete: vi.fn(async () => ({ kind: 'not_found' }) as const),
      uncomplete: vi.fn(async () => ({ kind: 'not_found' }) as const),
      applyBatch: vi.fn(async () => ({ kind: 'not_found' }) as const),
    });
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/api/library/other/seasons' }),
      app.inject({ method: 'PUT', url: '/api/library/other/seasons/1' }),
      app.inject({ method: 'DELETE', url: '/api/library/other/seasons/1' }),
      app.inject({
        method: 'PATCH',
        url: '/api/library/other/seasons',
        payload: { complete: [1] },
      }),
    ]);
    for (const response of responses) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Library entry not found.' });
    }
  });

  it('returns 400 for movie entries and 409 when the season limit is reached', async () => {
    const { app } = createApp(true, {
      list: vi.fn(async () => ({ kind: 'not_series' }) as const),
      complete: vi.fn(async () => ({ kind: 'limit_reached' }) as const),
      uncomplete: vi.fn(async () => ({ kind: 'not_series' }) as const),
      applyBatch: vi.fn(async () => ({ kind: 'limit_reached' }) as const),
    });
    expect((await app.inject({ method: 'GET', url: '/api/library/m/seasons' })).statusCode).toBe(
      400,
    );
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/library/m/seasons/1' })).statusCode,
    ).toBe(400);
    const full = await app.inject({ method: 'PUT', url: '/api/library/e/seasons/1' });
    expect(full.statusCode).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/library/e/seasons',
          payload: { complete: [1] },
        })
      ).statusCode,
    ).toBe(409);
  });

  it('rejects untrusted origins with 403 before authentication or storage', async () => {
    const { app, repository, auth } = createApp();
    const responses = await Promise.all(
      (['GET', 'PUT', 'DELETE'] as const).map((method) =>
        app.inject({
          method,
          url: `/api/library/e/seasons${method === 'GET' ? '' : '/1'}`,
          headers: { origin: 'https://evil.example' },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode)).toEqual([403, 403, 403]);
    expect(auth.api.getSession).not.toHaveBeenCalled();
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('applies rate limits', async () => {
    const { default: rateLimit } = await import('@fastify/rate-limit');
    const repository: SeasonProgressRepository = {
      list: vi.fn(async () => ({ kind: 'ok', value: view }) as const),
      complete: vi.fn(),
      uncomplete: vi.fn(async () => ({ kind: 'ok', value: null }) as const),
      applyBatch: vi.fn(),
    };
    const auth = {
      api: { getSession: vi.fn().mockResolvedValue({ user: { id: userId, role: 'user' } }) },
    } as unknown as AuthRuntime;
    const app = Fastify();
    app.register(rateLimit, { global: false });
    app.register(seasonProgressRoutes, { auth, repository });
    apps.push(app);

    const deletes: number[] = [];
    for (let index = 0; index < 31; index += 1) {
      deletes.push(
        (await app.inject({ method: 'DELETE', url: '/api/library/e/seasons/1' })).statusCode,
      );
    }
    expect(deletes.slice(0, 30).every((code) => code === 204)).toBe(true);
    expect(deletes[30]).toBe(429);

    const reads: number[] = [];
    for (let index = 0; index < 61; index += 1) {
      reads.push((await app.inject({ method: 'GET', url: '/api/library/e/seasons' })).statusCode);
    }
    expect(reads[59]).toBe(200);
    expect(reads[60]).toBe(429);
  });

  it('returns generic errors without leaking storage details', async () => {
    const secret = 'relation "season_progress" connection string postgres://user:pw@host';
    const { app } = createApp(true, {
      list: vi.fn(async () => {
        throw Object.assign(new Error(secret), { code: 'P1001' });
      }),
      complete: vi.fn(async () => {
        throw new Error(secret);
      }),
    });
    const unavailable = await app.inject({ method: 'GET', url: '/api/library/e/seasons' });
    const failed = await app.inject({ method: 'PUT', url: '/api/library/e/seasons/1' });
    expect(unavailable.statusCode).toBe(503);
    expect(failed.statusCode).toBe(500);
    expect(unavailable.body).not.toContain('season_progress');
    expect(failed.body).not.toContain('postgres://');
    expect(failed.body).not.toContain('relation');
  });

  it('returns a retryable 503 when a transaction times out waiting for the entry lock', async () => {
    const { app } = createApp(true, {
      complete: vi.fn(async () => {
        throw Object.assign(new Error('Transaction already closed'), { code: 'P2028' });
      }),
      applyBatch: vi.fn(async () => {
        throw Object.assign(new Error('Transaction already closed'), { code: 'P2028' });
      }),
    });
    const put = await app.inject({ method: 'PUT', url: '/api/library/e/seasons/1' });
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/library/e/seasons',
      payload: { complete: [1] },
    });
    expect(put.statusCode).toBe(503);
    expect(patch.statusCode).toBe(503);
    expect(put.body).not.toContain('Transaction');
  });

  it('returns 503 when the session cannot be verified', async () => {
    const { app, auth } = createApp();
    vi.mocked(auth.api.getSession).mockRejectedValueOnce(new Error('db down'));
    const response = await app.inject({ method: 'GET', url: '/api/library/e/seasons' });
    expect(response.statusCode).toBe(503);
  });
});
