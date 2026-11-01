// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryEntryView, TvDetail } from '@garquinsfilm/shared';

import { DEMO_DETAILS } from '../catalog/catalog.mock.js';

const libraryApi = vi.hoisted(() => ({
  listLibrary: vi.fn(),
  updateLibraryEntry: vi.fn(),
  deleteLibraryEntry: vi.fn(),
  createLibraryEntry: vi.fn(),
  findLibraryEntryForMedia: vi.fn(),
}));
const ratingsApi = vi.hoisted(() => ({
  getRating: vi.fn(),
  putRating: vi.fn(),
  deleteRating: vi.fn(),
}));
const seasonsApi = vi.hoisted(() => ({
  getSeasonProgress: vi.fn(),
  markSeasonComplete: vi.fn(),
  markSeasonPending: vi.fn(),
  applySeasonBatch: vi.fn(),
}));
const catalogApi = vi.hoisted(() => ({ getMediaDetail: vi.fn() }));

vi.mock('../library/library.api.js', () => libraryApi);
vi.mock('../ratings/ratings.api.js', () => ratingsApi);
vi.mock('./seasons.api.js', () => seasonsApi);
vi.mock('../catalog/catalog.api.js', () => catalogApi);

import { LibraryPage } from '../library/LibraryPage.js';
import { MediaDetailPage } from '../catalog/MediaDetailPage.js';

const tv = DEMO_DETAILS.find((item) => item.type === 'tv') as TvDetail;
const movie = DEMO_DETAILS.find((item) => item.type === 'movie')!;

function entryFor(type: 'tv' | 'movie', id: string, tmdbId: number): LibraryEntryView {
  return {
    id,
    source: 'tmdb',
    type,
    tmdbId,
    status: 'PENDING',
    isFavorite: false,
    addedAt: '2026-10-29T12:00:00.000Z',
    updatedAt: '2026-10-29T12:00:00.000Z',
    completedAt: null,
    media: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ratingsApi.getRating.mockResolvedValue(null);
  seasonsApi.getSeasonProgress.mockResolvedValue({ libraryEntryId: 'tv-1', completedSeasons: [] });
  libraryApi.findLibraryEntryForMedia.mockResolvedValue(null);
});
afterEach(cleanup);

describe('detail page integration', () => {
  it('asks to add the series first and does not query seasons', async () => {
    render(<MediaDetailPage media={tv} onBack={vi.fn()} isDemo />);
    expect(
      await screen.findByText(
        'Añade esta serie a tu biblioteca para seguir tus temporadas vistas.',
      ),
    ).toBeTruthy();
    expect(seasonsApi.getSeasonProgress).not.toHaveBeenCalled();
  });

  it('shows the tracker for a series already in the library', async () => {
    libraryApi.findLibraryEntryForMedia.mockResolvedValue(entryFor('tv', 'tv-1', tv.tmdbId));
    render(<MediaDetailPage media={tv} onBack={vi.fn()} isDemo />);
    expect(await screen.findByRole('progressbar', { name: 'Progreso de temporadas' })).toBeTruthy();
    expect(seasonsApi.getSeasonProgress).toHaveBeenCalledWith('tv-1', expect.anything());
  });

  it('shows no season tracking for movies', async () => {
    libraryApi.findLibraryEntryForMedia.mockResolvedValue(entryFor('movie', 'm-1', movie.tmdbId));
    render(<MediaDetailPage media={movie} onBack={vi.fn()} isDemo />);
    await screen.findByRole('button', { name: 'Puntuar y reseñar' });
    expect(screen.queryByText('Mis temporadas')).toBeNull();
    expect(seasonsApi.getSeasonProgress).not.toHaveBeenCalled();
  });
});

describe('library integration', () => {
  function listWith(...results: LibraryEntryView[]) {
    libraryApi.listLibrary.mockResolvedValue({
      page: 1,
      totalPages: 1,
      totalResults: results.length,
      results,
    });
  }

  it('offers «Mis temporadas» only on series, without per-card queries', async () => {
    listWith(entryFor('tv', 'tv-1', tv.tmdbId), entryFor('movie', 'm-1', 812));
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    await screen.findByRole('button', { name: /^Mis temporadas de/ });
    expect(screen.getAllByRole('button', { name: /^Mis temporadas de/ })).toHaveLength(1);
    expect(seasonsApi.getSeasonProgress).not.toHaveBeenCalled();
  });

  it('opens the dialog without requesting catalog metadata and keeps the load button disabled', async () => {
    listWith(entryFor('tv', 'tv-1', tv.tmdbId));
    catalogApi.getMediaDetail.mockResolvedValue(tv);
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    const opener = await screen.findByRole('button', { name: /^Mis temporadas de/ });
    opener.focus();
    fireEvent.click(opener);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await screen.findByText('Progreso indeterminado', { exact: false });
    expect(screen.getByText(/pendiente de habilitación/)).toBeTruthy();
    const load = screen.getByRole('button', {
      name: 'Cargar temporadas del catálogo',
    }) as HTMLButtonElement;
    expect(load.disabled).toBe(true);
    fireEvent.click(load);
    expect(catalogApi.getMediaDetail).not.toHaveBeenCalled();
    expect(seasonsApi.getSeasonProgress).toHaveBeenCalledTimes(1);
  });

  it('still lets the user mark and unmark saved seasons from the dialog', async () => {
    listWith(entryFor('tv', 'tv-1', tv.tmdbId));
    seasonsApi.getSeasonProgress.mockResolvedValue({
      libraryEntryId: 'tv-1',
      completedSeasons: [{ seasonNumber: 2, completedAt: '2026-01-01T00:00:00.000Z' }],
    });
    seasonsApi.markSeasonPending.mockResolvedValue(undefined);
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Mis temporadas de/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Desmarcar Temporada 2 como vista' }),
    );
    await waitFor(() => expect(seasonsApi.markSeasonPending).toHaveBeenCalledWith('tv-1', 2));
    expect(catalogApi.getMediaDetail).not.toHaveBeenCalled();
  });

  it('closes with Escape even when focus was lost and restores focus', async () => {
    listWith(entryFor('tv', 'tv-1', tv.tmdbId));
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    const opener = await screen.findByRole('button', { name: /^Mis temporadas de/ });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog');
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(libraryApi.updateLibraryEntry).not.toHaveBeenCalled();
  });

  it('does not apply a late season response after the dialog is closed', async () => {
    listWith(entryFor('tv', 'tv-1', tv.tmdbId));
    seasonsApi.getSeasonProgress.mockResolvedValue({
      libraryEntryId: 'tv-1',
      completedSeasons: [{ seasonNumber: 1, completedAt: '2026-01-01T00:00:00.000Z' }],
    });
    let resolveDelete: (value?: unknown) => void = () => undefined;
    seasonsApi.markSeasonPending.mockReturnValue(new Promise((r) => (resolveDelete = r)));
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Mis temporadas de/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Desmarcar Temporada 1 como vista' }),
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    resolveDelete();
    await Promise.resolve();
    expect(screen.queryByText('Temporada 1 marcada como pendiente.')).toBeNull();
  });
});
