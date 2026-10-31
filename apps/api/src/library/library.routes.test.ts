import type {
  LibraryCreateInput,
  LibraryEntryView,
  LibraryListQuery,
  LibraryListResponse,
  LibraryUpdateInput,
} from '@garquinsfilm/shared';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthRuntime } from '../auth/auth.js';
import libraryRoutes from './library.routes.js';
import { LibraryDuplicateEntryError, type LibraryRepository } from './library.service.js';

const userId = 'owner-user';
const entry: LibraryEntryView = {
  id: 'entry-1',
  source: 'tmdb',
  type: 'movie',
  tmdbId: 123,
  status: 'PENDING',
  isFavorite: false,
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  completedAt: null,
  media: null,
};

describe('personal library routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function createApp(authenticated = true, overrides: Partial<LibraryRepository> = {}) {
    const repository: LibraryRepository = {
      create: vi.fn(async () => entry),
      list: vi.fn(async (): Promise<LibraryListResponse> => ({
        page: 1,
        totalPages: 1,
        totalResults: 1,
        results: [entry],
      })),
      find: vi.fn(async () => entry),
      update: vi.fn(async () => entry),
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
    app.register(libraryRoutes, { auth, repository });
    apps.push(app);
    return { app, repository };
  }

  it('requires a session and returns private no-store headers', async () => {
    const { app, repository } = createApp(false);
    const response = await app.inject({ method: 'GET', url: '/api/library' });
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/library',
      payload: { source: 'tmdb', type: 'movie', tmdbId: 123 },
    });

    expect(response.statusCode).toBe(401);
    expect(createResponse.statusCode).toBe(401);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(repository.list).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', '/api/library', { source: 'tmdb', type: 'movie', tmdbId: 1 }],
    ['GET', '/api/library', undefined],
    ['GET', '/api/library/entry-1', undefined],
    ['PATCH', '/api/library/entry-1', { isFavorite: true }],
    ['DELETE', '/api/library/entry-1', undefined],
  ] as const)('requires a session for %s %s', async (method, url, payload) => {
    const { app, repository } = createApp(false);
    const response = await app.inject({
      method,
      url,
      headers:
        method === 'POST' || method === 'PATCH' || method === 'DELETE'
          ? { origin: 'http://127.0.0.1:5173' }
          : undefined,
      ...(payload === undefined ? {} : { payload }),
    });

    expect(response.statusCode).toBe(401);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.find).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('creates an entry using only the authenticated user and returns the default view', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/library',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: { source: 'tmdb', type: 'movie', tmdbId: 123 },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(entry);
    expect(repository.create).toHaveBeenCalledExactlyOnceWith(userId, {
      source: 'tmdb',
      type: 'movie',
      tmdbId: 123,
    } satisfies LibraryCreateInput);
  });

  it('accepts explicit status and favorite values', async () => {
    const explicitEntry = { ...entry, status: 'WATCHING' as const, isFavorite: true };
    const { app, repository } = createApp(true, {
      create: vi.fn(async () => explicitEntry),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/library',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: {
        source: 'tmdb',
        type: 'tv',
        tmdbId: 456,
        status: 'WATCHING',
        isFavorite: true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: 'WATCHING', isFavorite: true });
    expect(repository.create).toHaveBeenCalledExactlyOnceWith(userId, {
      source: 'tmdb',
      type: 'tv',
      tmdbId: 456,
      status: 'WATCHING',
      isFavorite: true,
    });
  });

  it('rejects client-supplied ownership and duplicate entries', async () => {
    const invalid = createApp();
    const invalidResponse = await invalid.app.inject({
      method: 'POST',
      url: '/api/library',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: { source: 'tmdb', type: 'movie', tmdbId: 123, userId: 'other-user' },
    });
    expect(invalidResponse.statusCode).toBe(400);
    expect(invalid.repository.create).not.toHaveBeenCalled();

    const duplicate = createApp(true, {
      create: vi.fn(async () => {
        throw new LibraryDuplicateEntryError();
      }),
    });
    const duplicateResponse = await duplicate.app.inject({
      method: 'POST',
      url: '/api/library',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: { source: 'tmdb', type: 'movie', tmdbId: 123 },
    });
    expect(duplicateResponse.statusCode).toBe(409);
  });

  it('validates and applies list filters without accepting unknown query parameters', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/library?type=tv&status=WATCHING&favorite=true&page=2&pageSize=10&sortBy=updatedAt&sortOrder=asc',
    });

    expect(response.statusCode).toBe(200);
    expect(repository.list).toHaveBeenCalledExactlyOnceWith(userId, {
      type: 'tv',
      status: 'WATCHING',
      favorite: true,
      page: 2,
      pageSize: 10,
      sortBy: 'updatedAt',
      sortOrder: 'asc',
    } satisfies LibraryListQuery);
    const invalid = await app.inject({ method: 'GET', url: '/api/library?owner=someone' });
    expect(invalid.statusCode).toBe(400);
  });

  it('returns indistinguishable 404s for entries not owned by the session user', async () => {
    const { app, repository } = createApp(true, {
      find: vi.fn(async () => null),
    });
    const response = await app.inject({ method: 'GET', url: '/api/library/foreign-entry' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Library entry not found.' });
    expect(repository.find).toHaveBeenCalledExactlyOnceWith(userId, 'foreign-entry');
  });

  it('does not update or delete entries that the repository cannot find for the session owner', async () => {
    const { app, repository } = createApp(true, {
      update: vi.fn(async () => null),
      delete: vi.fn(async () => false),
    });
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/library/foreign-entry',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: { status: 'ABANDONED' },
    });
    const remove = await app.inject({
      method: 'DELETE',
      url: '/api/library/foreign-entry',
      headers: { origin: 'http://127.0.0.1:5173' },
    });

    expect(patch.statusCode).toBe(404);
    expect(remove.statusCode).toBe(404);
    expect(repository.update).toHaveBeenCalledExactlyOnceWith(userId, 'foreign-entry', {
      status: 'ABANDONED',
    });
    expect(repository.delete).toHaveBeenCalledExactlyOnceWith(userId, 'foreign-entry');
  });

  it('allows only favorite and status updates, then deletes only the owned entry', async () => {
    const { app, repository } = createApp();
    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/library/entry-1',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: { status: 'COMPLETED', isFavorite: true },
    });
    expect(patched.statusCode).toBe(200);
    expect(repository.update).toHaveBeenCalledExactlyOnceWith(userId, 'entry-1', {
      status: 'COMPLETED',
      isFavorite: true,
    } satisfies LibraryUpdateInput);

    const invalid = await app.inject({
      method: 'PATCH',
      url: '/api/library/entry-1',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: { tmdbId: 999 },
    });
    expect(invalid.statusCode).toBe(400);

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/library/entry-1',
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    expect(deleted.statusCode).toBe(204);
    expect(repository.delete).toHaveBeenCalledExactlyOnceWith(userId, 'entry-1');
  });

  it('rejects state-changing requests from an untrusted Origin', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/library/entry-1',
      headers: { origin: 'https://attacker.example' },
      payload: { isFavorite: true },
    });
    expect(response.statusCode).toBe(403);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('returns a generic 503 when database connectivity is unavailable', async () => {
    const databaseError = Object.assign(new Error('private connection details'), {
      code: 'P1001',
    });
    const { app } = createApp(true, {
      list: vi.fn(async () => {
        throw databaseError;
      }),
    });
    const response = await app.inject({ method: 'GET', url: '/api/library' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: 'Library storage is temporarily unavailable.',
    });
    expect(response.body).not.toContain('private connection details');
  });
});
