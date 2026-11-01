import type { RatingPutInput, RatingView } from '@garquinsfilm/shared';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthRuntime } from '../auth/auth.js';
import ratingRoutes from './ratings.routes.js';
import { RatingConflictError, type RatingRepository } from './ratings.service.js';

const userId = 'rating-owner';
const rating: RatingView = {
  libraryEntryId: 'owned-entry',
  score: 8.7,
  review: 'Una reseña privada.',
  containsSpoilers: true,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

describe('personal rating routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function createApp(authenticated = true, overrides: Partial<RatingRepository> = {}) {
    const repository: RatingRepository = {
      find: vi.fn(async () => ({ entryExists: true, rating })),
      set: vi.fn(async (_userId: string, _entryId: string, input: RatingPutInput) => ({
        rating: { ...rating, score: input.score, review: input.review },
        created: false,
      })),
      delete: vi.fn(async () => true),
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
    app.register(ratingRoutes, { auth, repository });
    apps.push(app);
    return { app, repository };
  }

  it('requires a session and sends private no-store headers', async () => {
    const { app, repository } = createApp(false);
    const response = await app.inject({
      method: 'GET',
      url: '/api/library/owned-entry/rating',
    });
    const put = await app.inject({
      method: 'PUT',
      url: '/api/library/owned-entry/rating',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: { score: 8, review: null, containsSpoilers: false },
    });
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/library/owned-entry/rating',
    });

    expect(response.statusCode).toBe(401);
    expect(put.statusCode).toBe(401);
    expect(deleted.statusCode).toBe(401);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(repository.find).not.toHaveBeenCalled();
    expect(repository.set).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('returns the owned rating or null when no rating exists', async () => {
    const found = createApp();
    const response = await found.app.inject({
      method: 'GET',
      url: '/api/library/owned-entry/rating',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(rating);
    expect(found.repository.find).toHaveBeenCalledExactlyOnceWith(userId, 'owned-entry');

    const missingRating = createApp(true, {
      find: vi.fn(async () => ({ entryExists: true, rating: null })),
    });
    const empty = await missingRating.app.inject({
      method: 'GET',
      url: '/api/library/owned-entry/rating',
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toBeNull();
  });

  it('returns an indistinguishable 404 for a missing or foreign entry', async () => {
    const { app, repository } = createApp(true, {
      find: vi.fn(async () => ({ entryExists: false, rating: null })),
      set: vi.fn(async () => null),
      delete: vi.fn(async () => false),
    });
    for (const method of ['GET', 'PUT', 'DELETE'] as const) {
      const response = await app.inject({
        method,
        url: '/api/library/foreign-entry/rating',
        headers: { origin: 'http://127.0.0.1:5173' },
        ...(method === 'PUT'
          ? { payload: { score: 8, review: null, containsSpoilers: false } }
          : {}),
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Library entry not found.' });
    }
    expect(repository.find).toHaveBeenCalledWith(userId, 'foreign-entry');
    expect(repository.set).toHaveBeenCalledWith(userId, 'foreign-entry', {
      score: 8,
      review: null,
      containsSpoilers: false,
    });
    expect(repository.delete).toHaveBeenCalledWith(userId, 'foreign-entry');
  });

  it('creates then replaces ratings using the session owner and strict complete input', async () => {
    const { app, repository } = createApp(true, {
      set: vi
        .fn()
        .mockResolvedValueOnce({ rating, created: true })
        .mockResolvedValueOnce({ rating, created: false }),
    });
    const payload = { score: 8.7, review: 'Una reseña privada.', containsSpoilers: true };
    const created = await app.inject({
      method: 'PUT',
      url: '/api/library/owned-entry/rating',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload,
    });
    const replaced = await app.inject({
      method: 'PUT',
      url: '/api/library/owned-entry/rating',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: { ...payload, userId: 'attacker' },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual(rating);
    expect(replaced.statusCode).toBe(400);
    expect(repository.set).toHaveBeenCalledExactlyOnceWith(userId, 'owned-entry', payload);
  });

  it.each([
    { score: 8.75, review: null, containsSpoilers: false },
    { score: null, review: null, containsSpoilers: false },
    { score: 8, review: null, containsSpoilers: true },
    { score: 8, review: '<script>alert(1)</script>', containsSpoilers: false, extra: true },
    { score: 8 },
  ])('rejects invalid PUT body $score', async (payload) => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/library/owned-entry/rating',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(repository.set).not.toHaveBeenCalled();
  });

  it('rejects PUT request bodies larger than 16 KiB before repository access', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/library/owned-entry/rating',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: {
        score: null,
        review: 'x'.repeat(16 * 1024),
        containsSpoilers: false,
      },
    });

    expect(response.statusCode).toBe(413);
    expect(repository.set).not.toHaveBeenCalled();
  });

  it('deletes only the own rating and is idempotent while its entry exists', async () => {
    const { app, repository } = createApp(true, {
      delete: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true),
    });
    for (let count = 0; count < 2; count += 1) {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/owned-entry/rating',
        headers: { origin: 'http://127.0.0.1:5173' },
      });
      expect(response.statusCode).toBe(204);
    }
    expect(repository.delete).toHaveBeenCalledTimes(2);
    expect(repository.delete).toHaveBeenNthCalledWith(1, userId, 'owned-entry');
  });

  it('returns generic 409/503 errors and rejects untrusted origins', async () => {
    const conflict = createApp(true, {
      set: vi.fn(async () => {
        throw new RatingConflictError({ cause: new Error('private database details') });
      }),
    });
    const conflictResponse = await conflict.app.inject({
      method: 'PUT',
      url: '/api/library/owned-entry/rating',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: { score: 8, review: null, containsSpoilers: false },
    });
    expect(conflictResponse.statusCode).toBe(409);
    expect(conflictResponse.body).not.toContain('private database details');

    const unavailable = createApp(true, {
      find: vi.fn(async () => {
        throw Object.assign(new Error('private connection details'), { code: 'P1001' });
      }),
    });
    const unavailableResponse = await unavailable.app.inject({
      method: 'GET',
      url: '/api/library/owned-entry/rating',
    });
    expect(unavailableResponse.statusCode).toBe(503);
    expect(unavailableResponse.body).not.toContain('private connection details');

    const untrusted = createApp();
    const denied = await untrusted.app.inject({
      method: 'DELETE',
      url: '/api/library/owned-entry/rating',
      headers: { origin: 'https://attacker.example' },
    });
    expect(denied.statusCode).toBe(403);
    expect(untrusted.repository.delete).not.toHaveBeenCalled();
  });
});
