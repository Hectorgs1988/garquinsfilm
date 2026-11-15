import type { LibraryEntryView, MediaSummary, Paginated } from '@garquinsfilm/shared';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthRuntime } from '../auth/auth.js';
import libraryRoutes from './library.routes.js';
import type { MediaSummaryLoader } from '../catalog/media.enrich.js';
import type { LibraryRepository } from './library.service.js';

const userId = 'library-owner';

function entry(overrides: Partial<LibraryEntryView> = {}): LibraryEntryView {
  return {
    id: 'entry-1',
    source: 'tmdb',
    type: 'movie',
    tmdbId: 438631,
    status: 'PENDING',
    isFavorite: false,
    addedAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    completedAt: null,
    media: null,
    ...overrides,
  };
}

const dune: MediaSummary = {
  source: 'tmdb',
  type: 'movie',
  tmdbId: 438631,
  title: 'Dune',
  originalTitle: 'Dune',
  year: 2021,
  overview: 'Arrakis.',
  posterUrl: null,
  voteAverage: 7.8,
  voteCount: 100,
};

function page(results: LibraryEntryView[]): Paginated<LibraryEntryView> {
  return { page: 1, totalPages: 1, totalResults: results.length, results };
}

describe('library routes with TMDB metadata', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function createApp(mediaLoader: MediaSummaryLoader | null) {
    const repository = {
      create: vi.fn(async () => entry()),
      list: vi.fn(async () => page([entry()])),
      find: vi.fn(async () => entry()),
      update: vi.fn(async () => entry({ status: 'COMPLETED' })),
      delete: vi.fn(async () => true),
    } as unknown as LibraryRepository;
    const auth = {
      api: { getSession: vi.fn().mockResolvedValue({ user: { id: userId, role: 'user' } }) },
    } as unknown as AuthRuntime;
    const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
    app.register(libraryRoutes, { auth, repository, mediaLoader });
    apps.push(app);
    return app;
  }

  const loader: MediaSummaryLoader = { load: vi.fn(async () => dune) };

  it('adds the title to every entry of the listing', async () => {
    const app = createApp(loader);
    const response = await app.inject({ method: 'GET', url: '/api/library' });

    expect(response.statusCode).toBe(200);
    const body = response.json<Paginated<LibraryEntryView>>();
    expect(body.results[0]?.media?.title).toBe('Dune');
    expect(body.totalResults).toBe(1);
  });

  it('adds the title when reading a single entry', async () => {
    const app = createApp(loader);
    const response = await app.inject({ method: 'GET', url: '/api/library/entry-1' });

    expect(response.statusCode).toBe(200);
    expect(response.json<LibraryEntryView>().media?.title).toBe('Dune');
  });

  it('keeps the title after changing the entry', async () => {
    const app = createApp(loader);
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/library/entry-1',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: { status: 'COMPLETED' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<LibraryEntryView>();
    expect(body.status).toBe('COMPLETED');
    expect(body.media?.title).toBe('Dune');
  });

  it('serves the library anyway when TMDB is unavailable', async () => {
    const failing: MediaSummaryLoader = {
      load: vi.fn(async () => {
        throw new Error('TMDB down');
      }),
    };
    const app = createApp(failing);
    const response = await app.inject({ method: 'GET', url: '/api/library' });

    expect(response.statusCode).toBe(200);
    expect(response.json<Paginated<LibraryEntryView>>().results[0]?.media).toBeNull();
  });

  it('skips TMDB entirely when no loader is configured', async () => {
    const app = createApp(null);
    const response = await app.inject({ method: 'GET', url: '/api/library' });

    expect(response.statusCode).toBe(200);
    expect(response.json<Paginated<LibraryEntryView>>().results[0]?.media).toBeNull();
  });
});
