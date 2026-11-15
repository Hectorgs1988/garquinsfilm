import type { MediaListDetailView, MediaListItemView, MediaListView } from '@garquinsfilm/shared';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthRuntime } from '../auth/auth.js';
import type { MediaSummaryLoader } from '../catalog/media.enrich.js';
import listsRoutes from './lists.routes.js';
import {
  ListItemDuplicateError,
  ListLimitReachedError,
  ListUpdateConflictError,
  type ListRepository,
} from './lists.service.js';

const userId = 'list-owner';
const trustedOrigin = 'http://127.0.0.1:5173';
const stamp = '2026-11-15T10:00:00.000Z';

const list: MediaListView = {
  id: 'list-1',
  name: 'Cine de los 90',
  description: null,
  mode: 'personal',
  access: 'owner',
  owner: { id: userId, name: 'Ada' },
  itemCount: 1,
  memberCount: 0,
  createdAt: stamp,
  updatedAt: stamp,
};

const item: MediaListItemView = {
  id: 'item-1',
  position: 1,
  addedAt: stamp,
  addedBy: { id: userId, name: 'Ada' },
  type: 'movie',
  tmdbId: 438631,
  media: null,
};

const detail: MediaListDetailView = { ...list, items: [item] };

const loader: MediaSummaryLoader = {
  load: vi.fn(async () => ({
    source: 'tmdb' as const,
    type: 'movie' as const,
    tmdbId: 438631,
    title: 'Dune',
    originalTitle: 'Dune',
    year: 2021,
    overview: null,
    posterUrl: null,
    voteAverage: null,
    voteCount: null,
  })),
};

describe('list routes', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function createApp(
    session: 'valid' | 'none' | 'error' = 'valid',
    overrides: Partial<ListRepository> = {},
    mediaLoader: MediaSummaryLoader | null = null,
  ) {
    const repository: ListRepository = {
      list: vi.fn(async () => [list]),
      create: vi.fn(async () => list),
      findDetail: vi.fn(async () => detail),
      update: vi.fn(async () => list),
      delete: vi.fn(async () => true),
      addItem: vi.fn(async () => item),
      removeItem: vi.fn(async () => true),
      ...overrides,
    };
    const getSession = vi.fn();
    if (session === 'valid') getSession.mockResolvedValue({ user: { id: userId, role: 'user' } });
    if (session === 'none') getSession.mockResolvedValue(null);
    if (session === 'error') getSession.mockRejectedValue(new Error('db down'));
    const auth = { api: { getSession } } as unknown as AuthRuntime;
    const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
    app.register(listsRoutes, { auth, repository, mediaLoader });
    apps.push(app);
    return { app, repository };
  }

  it('requires a session on every route', async () => {
    const { app, repository } = createApp('none');
    for (const [method, url] of [
      ['GET', '/api/lists'],
      ['GET', '/api/lists/list-1'],
      ['DELETE', '/api/lists/list-1'],
      ['DELETE', '/api/lists/list-1/items/item-1'],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
    }
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.findDetail).not.toHaveBeenCalled();
    expect(repository.removeItem).not.toHaveBeenCalled();
  });

  it('returns 503 when the session cannot be verified', async () => {
    const { app } = createApp('error');
    expect((await app.inject({ method: 'GET', url: '/api/lists' })).statusCode).toBe(503);
  });

  it('rejects untrusted origins before touching the repository', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { origin: 'https://evil.example' },
      payload: { name: 'Cine' },
    });

    expect(response.statusCode).toBe(403);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('sends private no-store headers', async () => {
    const { app } = createApp();
    const response = await app.inject({ method: 'GET', url: '/api/lists' });
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('lists what the session user can see', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({ method: 'GET', url: '/api/lists' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ results: [list] });
    expect(repository.list).toHaveBeenCalledExactlyOnceWith(userId);
  });

  it('creates a list with a normalized name', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { origin: trustedOrigin },
      payload: { name: '  Cine de los 90  ' },
    });

    expect(response.statusCode).toBe(201);
    expect(repository.create).toHaveBeenCalledExactlyOnceWith(userId, { name: 'Cine de los 90' });
  });

  it('reports the limit of lists per user as a conflict', async () => {
    const { app } = createApp('valid', {
      create: vi.fn(async () => {
        throw new ListLimitReachedError();
      }),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { origin: trustedOrigin },
      payload: { name: 'Una más' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toContain('50');
  });

  it.each([
    {},
    { name: '   ' },
    { name: 'x'.repeat(81) },
    { name: 'Cine', ownerId: 'otro' },
    { description: 'Sin nombre' },
  ])('rejects an invalid body %j', async (payload) => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists',
      headers: { origin: trustedOrigin },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('returns the list with its titles', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({ method: 'GET', url: '/api/lists/list-1' });

    expect(response.statusCode).toBe(200);
    expect(response.json<MediaListDetailView>().items).toHaveLength(1);
    expect(repository.findDetail).toHaveBeenCalledExactlyOnceWith(userId, 'list-1');
  });

  it('fills in the titles when a loader is available', async () => {
    const { app } = createApp('valid', {}, loader);
    const response = await app.inject({ method: 'GET', url: '/api/lists/list-1' });

    expect(response.json<MediaListDetailView>().items[0]?.media?.title).toBe('Dune');
  });

  it('serves the list anyway when TMDB fails', async () => {
    const failing: MediaSummaryLoader = {
      load: vi.fn(async () => {
        throw new Error('TMDB down');
      }),
    };
    const { app } = createApp('valid', {}, failing);
    const response = await app.inject({ method: 'GET', url: '/api/lists/list-1' });

    expect(response.statusCode).toBe(200);
    expect(response.json<MediaListDetailView>().items[0]?.media).toBeNull();
  });

  it('hides a list the user cannot see behind a 404', async () => {
    const { app } = createApp('valid', { findDetail: vi.fn(async () => null) });
    const response = await app.inject({ method: 'GET', url: '/api/lists/list-1' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'List not found.' });
  });

  it('answers 404 to a malformed id instead of leaking that it is malformed', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({ method: 'GET', url: '/api/lists/..%2F..%2Fetc' });

    expect(response.statusCode).toBe(404);
    expect(repository.findDetail).not.toHaveBeenCalled();
  });

  it('refuses an edit without the version the client saw', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/lists/list-1',
      headers: { origin: trustedOrigin },
      payload: { name: 'Otro nombre' },
    });

    expect(response.statusCode).toBe(400);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('reports a simultaneous edit as a conflict', async () => {
    const { app } = createApp('valid', {
      update: vi.fn(async () => {
        throw new ListUpdateConflictError();
      }),
    });
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/lists/list-1',
      headers: { origin: trustedOrigin },
      payload: { name: 'Otro nombre', expectedUpdatedAt: stamp },
    });

    expect(response.statusCode).toBe(409);
  });

  it('answers 404 when someone who is not the owner edits or deletes', async () => {
    const { app } = createApp('valid', {
      update: vi.fn(async () => null),
      delete: vi.fn(async () => false),
    });

    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/lists/list-1',
      headers: { origin: trustedOrigin },
      payload: { name: 'Mía ahora', expectedUpdatedAt: stamp },
    });
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/lists/list-1',
      headers: { origin: trustedOrigin },
    });

    expect(patched.statusCode).toBe(404);
    expect(deleted.statusCode).toBe(404);
  });

  it('deletes and answers without content', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/lists/list-1',
      headers: { origin: trustedOrigin },
    });

    expect(response.statusCode).toBe(204);
    expect(repository.delete).toHaveBeenCalledExactlyOnceWith(userId, 'list-1');
  });

  it('adds a title taken from the catalogue', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists/list-1/items',
      headers: { origin: trustedOrigin },
      payload: { source: 'tmdb', type: 'movie', tmdbId: 438631 },
    });

    expect(response.statusCode).toBe(201);
    expect(repository.addItem).toHaveBeenCalledExactlyOnceWith(userId, 'list-1', {
      source: 'tmdb',
      type: 'movie',
      tmdbId: 438631,
    });
  });

  it.each([
    {},
    { source: 'tmdb', type: 'movie' },
    { source: 'imdb', type: 'movie', tmdbId: 1 },
    { source: 'tmdb', type: 'book', tmdbId: 1 },
    { source: 'tmdb', type: 'movie', tmdbId: 0 },
    { source: 'tmdb', type: 'movie', tmdbId: 1.5 },
    { source: 'tmdb', type: 'movie', tmdbId: 1, position: 3 },
  ])('rejects an invalid title %j', async (payload) => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists/list-1/items',
      headers: { origin: trustedOrigin },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(repository.addItem).not.toHaveBeenCalled();
  });

  it('reports a repeated title as a conflict', async () => {
    const { app } = createApp('valid', {
      addItem: vi.fn(async () => {
        throw new ListItemDuplicateError();
      }),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists/list-1/items',
      headers: { origin: trustedOrigin },
      payload: { source: 'tmdb', type: 'movie', tmdbId: 438631 },
    });

    expect(response.statusCode).toBe(409);
  });

  it('reports the title limit as a conflict naming the number', async () => {
    const { app } = createApp('valid', {
      addItem: vi.fn(async () => {
        throw new ListLimitReachedError();
      }),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/lists/list-1/items',
      headers: { origin: trustedOrigin },
      payload: { source: 'tmdb', type: 'movie', tmdbId: 438631 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toContain('500');
  });

  it('answers 404 when a reader tries to add or remove a title', async () => {
    const { app } = createApp('valid', {
      addItem: vi.fn(async () => null),
      removeItem: vi.fn(async () => false),
    });

    const added = await app.inject({
      method: 'POST',
      url: '/api/lists/list-1/items',
      headers: { origin: trustedOrigin },
      payload: { source: 'tmdb', type: 'movie', tmdbId: 438631 },
    });
    const removed = await app.inject({
      method: 'DELETE',
      url: '/api/lists/list-1/items/item-1',
      headers: { origin: trustedOrigin },
    });

    expect(added.statusCode).toBe(404);
    expect(removed.statusCode).toBe(404);
  });

  it('removes a title and answers without content', async () => {
    const { app, repository } = createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/lists/list-1/items/item-1',
      headers: { origin: trustedOrigin },
    });

    expect(response.statusCode).toBe(204);
    expect(repository.removeItem).toHaveBeenCalledExactlyOnceWith(userId, 'list-1', 'item-1');
  });

  it('maps database outages to 503 without leaking details', async () => {
    const { app } = createApp('valid', {
      list: vi.fn(async () => {
        throw Object.assign(new Error('connection refused at 10.0.0.5'), { code: 'P1001' });
      }),
    });
    const response = await app.inject({ method: 'GET', url: '/api/lists' });

    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('10.0.0.5');
  });
});
