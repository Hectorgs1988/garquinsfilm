import type { LibraryEntryView, MediaSummary } from '@garquinsfilm/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  enrichEntries,
  toMediaSummary,
  type EnrichableItem,
  type MediaSummaryLoader,
} from './media.enrich.js';

function entry(overrides: Partial<LibraryEntryView> = {}): LibraryEntryView {
  return {
    id: `entry-${overrides.tmdbId ?? 1}`,
    source: 'tmdb',
    type: 'movie',
    tmdbId: 1,
    status: 'PENDING',
    isFavorite: false,
    addedAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    completedAt: null,
    media: null,
    ...overrides,
  };
}

function summary(tmdbId: number, title: string): MediaSummary {
  return {
    source: 'tmdb',
    type: 'movie',
    tmdbId,
    title,
    originalTitle: title,
    year: 2021,
    overview: null,
    posterUrl: null,
    voteAverage: null,
    voteCount: null,
  };
}

function loaderOf(map: Record<string, MediaSummary>): MediaSummaryLoader {
  return { load: vi.fn(async (type, tmdbId) => map[`${type}:${tmdbId}`] ?? null) };
}

describe('library enrichment', () => {
  it('fills the title of each entry', async () => {
    const loader = loaderOf({ 'movie:1': summary(1, 'Dune'), 'tv:2': summary(2, 'Severance') });
    const result = await enrichEntries(
      [entry(), entry({ id: 'b', type: 'tv', tmdbId: 2 })],
      loader,
    );

    expect(result[0]?.media?.title).toBe('Dune');
    expect(result[1]?.media?.title).toBe('Severance');
  });

  it('asks TMDB once per title even if it is repeated', async () => {
    const loader = loaderOf({ 'movie:1': summary(1, 'Dune') });
    await enrichEntries([entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })], loader);

    expect(loader.load).toHaveBeenCalledTimes(1);
  });

  it('keeps the entry untouched when TMDB does not know the title', async () => {
    const result = await enrichEntries([entry()], loaderOf({}));
    expect(result[0]?.media).toBeNull();
  });

  it('does not let one failure spoil the rest', async () => {
    const loader: MediaSummaryLoader = {
      load: vi.fn(async (_type, tmdbId) => {
        if (tmdbId === 1) throw new Error('TMDB down');
        return summary(2, 'Severance');
      }),
    };
    const result = await enrichEntries([entry(), entry({ id: 'b', tmdbId: 2 })], loader);

    expect(result[0]?.media).toBeNull();
    expect(result[1]?.media?.title).toBe('Severance');
  });

  it('returns the entries as they are when there is no loader', async () => {
    const result = await enrichEntries([entry()], null);
    expect(result[0]?.media).toBeNull();
  });

  it('never calls TMDB for entries that already carry metadata', async () => {
    const loader = loaderOf({ 'movie:1': summary(1, 'Otro título') });
    const existing = summary(1, 'Ya estaba');
    const result = await enrichEntries([entry({ media: existing })], loader);

    expect(loader.load).not.toHaveBeenCalled();
    expect(result[0]?.media?.title).toBe('Ya estaba');
  });

  it('answers without titles rather than holding the response', async () => {
    const loader: MediaSummaryLoader = {
      load: vi.fn(() => new Promise<MediaSummary | null>(() => undefined)),
    };
    const started = Date.now();
    const result = await enrichEntries([entry()], loader, { timeoutMs: 40 });

    expect(Date.now() - started).toBeLessThan(1000);
    expect(result[0]?.media).toBeNull();
  });

  it('limits how many titles it asks for at the same time', async () => {
    let inFlight = 0;
    let peak = 0;
    const loader: MediaSummaryLoader = {
      load: vi.fn(async (_type, tmdbId) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return summary(tmdbId, `Título ${tmdbId}`);
      }),
    };
    const entries = Array.from({ length: 10 }, (_item, index) =>
      entry({ id: `e${index}`, tmdbId: index + 1 }),
    );

    const result = await enrichEntries(entries, loader, { concurrency: 3, timeoutMs: 2000 });

    expect(peak).toBeLessThanOrEqual(3);
    expect(result.every((item) => item.media !== null)).toBe(true);
  });

  it('works with any item that carries an identity, not only library entries', async () => {
    const loader = loaderOf({ 'movie:1': summary(1, 'Dune') });
    // Sin anotar, `media: null` se infiere como el literal null y el resultado sería `never`.
    const listItem: EnrichableItem & { id: string; position: number } = {
      id: 'item-1',
      position: 1,
      type: 'movie',
      tmdbId: 1,
      media: null,
    };

    const [result] = await enrichEntries([listItem], loader);

    expect(result?.media?.title).toBe('Dune');
    expect(result?.position).toBe(1);
  });

  it('copies only the summary fields out of a detail', () => {
    // Trae campos de MovieDetail a propósito: deben quedarse fuera del resumen.
    const detail = {
      source: 'tmdb' as const,
      type: 'movie' as const,
      tmdbId: 7,
      title: 'Arrival',
      originalTitle: 'Arrival',
      year: 2016,
      overview: 'Lingüística alienígena.',
      posterUrl: 'https://image.tmdb.org/poster.jpg',
      voteAverage: 7.6,
      voteCount: 1234,
      cast: [],
      directors: [],
      videos: [],
      trailer: null,
      watchProviders: { link: null, flatrate: [], rent: [], buy: [] },
      releaseDate: '2016-11-11',
      runtime: 116,
      genres: [],
      status: 'Released',
      backdropUrl: null,
      tagline: null,
    };

    expect(toMediaSummary(detail)).toEqual({
      source: 'tmdb',
      type: 'movie',
      tmdbId: 7,
      title: 'Arrival',
      originalTitle: 'Arrival',
      year: 2016,
      overview: 'Lingüística alienígena.',
      posterUrl: 'https://image.tmdb.org/poster.jpg',
      voteAverage: 7.6,
      voteCount: 1234,
    });
  });
});
