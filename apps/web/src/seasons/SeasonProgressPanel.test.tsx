// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeasonProgressView, TvSeason } from '@garquinsfilm/shared';

import { ApiError } from '../api.js';

const api = vi.hoisted(() => ({
  getSeasonProgress: vi.fn(),
  markSeasonComplete: vi.fn(),
  markSeasonPending: vi.fn(),
  applySeasonBatch: vi.fn(),
}));
vi.mock('./seasons.api.js', () => api);

import { SeasonProgressPanel } from './SeasonProgressPanel.js';

const TODAY = '2026-06-01';

function season(seasonNumber: number, overrides: Partial<TvSeason> = {}): TvSeason {
  return {
    seasonNumber,
    name: `Temporada ${seasonNumber}`,
    episodeCount: 8,
    airDate: '2020-01-01',
    posterUrl: null,
    isSpecial: seasonNumber === 0,
    ...overrides,
  };
}

function view(...numbers: number[]): SeasonProgressView {
  return {
    libraryEntryId: 'entry-1',
    completedSeasons: numbers.map((seasonNumber) => ({
      seasonNumber,
      completedAt: '2026-01-01T00:00:00.000Z',
    })),
  };
}

function renderPanel(
  seasons: TvSeason[] | null,
  onUnauthorized = vi.fn(),
  seriesStatus: string | null = 'Returning Series',
) {
  render(
    <SeasonProgressPanel
      entryId="entry-1"
      seasons={seasons}
      seriesStatus={seriesStatus}
      onUnauthorized={onUnauthorized}
      today={TODAY}
    />,
  );
  return onUnauthorized;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('SeasonProgressPanel', () => {
  it('shows loading and then an accessible progress bar', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view(1));
    renderPanel([season(1), season(2)]);
    expect(screen.getByText('Cargando tus temporadas…')).toBeTruthy();
    const bar = await screen.findByRole('progressbar', { name: 'Progreso de temporadas' });
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuetext')).toBeTruthy();
  });

  it('marks a season complete using the server response', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view());
    api.markSeasonComplete.mockResolvedValueOnce({
      seasonNumber: 1,
      completedAt: '2026-01-01T00:00:00.000Z',
    });
    renderPanel([season(1)]);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar Temporada 1 como vista' }));
    expect(
      await screen.findByRole('button', { name: 'Desmarcar Temporada 1 como vista' }),
    ).toBeTruthy();
    expect(api.markSeasonComplete).toHaveBeenCalledWith('entry-1', 1);
  });

  it('unmarks a season', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view(1));
    api.markSeasonPending.mockResolvedValueOnce(undefined);
    renderPanel([season(1)]);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Desmarcar Temporada 1 como vista' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Marcar Temporada 1 como vista' }),
    ).toBeTruthy();
    expect(api.markSeasonPending).toHaveBeenCalledWith('entry-1', 1);
  });

  it('prevents duplicate requests while an operation is pending', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view());
    let resolve: (value: unknown) => void = () => undefined;
    api.markSeasonComplete.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderPanel([season(1), season(2)]);
    const first = await screen.findByRole('button', { name: 'Marcar Temporada 1 como vista' });
    fireEvent.click(first);
    fireEvent.click(first);
    expect(api.markSeasonComplete).toHaveBeenCalledTimes(1);
    const other = screen.getByRole('button', {
      name: 'Marcar Temporada 2 como vista',
    }) as HTMLButtonElement;
    expect(other.disabled).toBe(true);
    resolve({ seasonNumber: 1, completedAt: '2026-01-01T00:00:00.000Z' });
    await waitFor(() => expect(other.disabled).toBe(false));
  });

  it('marks up to a season with a single batch call', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view());
    api.applySeasonBatch.mockResolvedValueOnce(view(1, 2, 3));
    renderPanel([season(1), season(2), season(3)]);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar hasta Temporada 3' }));
    await screen.findByRole('button', { name: 'Desmarcar Temporada 3 como vista' });
    expect(api.applySeasonBatch).toHaveBeenCalledTimes(1);
    expect(api.applySeasonBatch).toHaveBeenCalledWith('entry-1', { complete: [1, 2, 3] });
  });

  it('refuses a batch above 100 seasons without calling the API', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view());
    renderPanel(Array.from({ length: 101 }, (_, i) => season(i + 1)));
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar hasta Temporada 101' }));
    expect((await screen.findByRole('alert')).textContent).toContain('100');
    expect(api.applySeasonBatch).not.toHaveBeenCalled();
  });

  it('separates specials and does not count them', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view(0));
    renderPanel([season(0), season(1)]);
    expect(await screen.findByText('No cuentan para el porcentaje.')).toBeTruthy();
    expect(
      screen
        .getByRole('progressbar', { name: 'Progreso de temporadas' })
        .getAttribute('aria-valuenow'),
    ).toBe('0');
  });

  it('labels future seasons as upcoming and not markable', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view(1));
    renderPanel([season(1), season(2, { airDate: '2026-12-01' })]);
    expect(await screen.findByText('Próximamente')).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Marcar Temporada 2 como vista',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText('Al día con las temporadas estrenadas.')).toBeTruthy();
  });

  it('shows series completed only for ended series', async () => {
    api.getSeasonProgress.mockResolvedValue(view(1));
    renderPanel([season(1)], vi.fn(), 'Ended');
    expect(await screen.findByText('Serie completada.')).toBeTruthy();
    cleanup();
    renderPanel([season(1)], vi.fn(), 'Returning Series');
    await screen.findByRole('progressbar');
    expect(screen.queryByText('Serie completada.')).toBeNull();
  });

  it('is indeterminate without metadata and still lists completed seasons', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view(2));
    renderPanel(null);
    expect(await screen.findByText('Temporadas completadas')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows a retryable error when loading fails', async () => {
    api.getSeasonProgress
      .mockRejectedValueOnce(new ApiError(503, 'x'))
      .mockResolvedValueOnce(view());
    renderPanel([season(1)]);
    expect((await screen.findByRole('alert')).textContent).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('progressbar')).toBeTruthy();
  });

  it('calls the unauthorized handler on 401', async () => {
    api.getSeasonProgress.mockRejectedValueOnce(new ApiError(401, 'x'));
    const onUnauthorized = renderPanel([season(1)]);
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });

  it('reloads from the server after a 404 on a mutation', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view()).mockResolvedValueOnce(view(1));
    api.markSeasonComplete.mockRejectedValueOnce(new ApiError(404, 'x'));
    renderPanel([season(1)]);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar Temporada 1 como vista' }));
    expect(
      await screen.findByRole('button', { name: 'Desmarcar Temporada 1 como vista' }),
    ).toBeTruthy();
    expect(api.getSeasonProgress).toHaveBeenCalledTimes(2);
  });

  it('keeps state and shows an error when a mutation fails', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view());
    api.markSeasonComplete.mockRejectedValueOnce(new ApiError(0, 'net'));
    renderPanel([season(1)]);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar Temporada 1 como vista' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Marcar Temporada 1 como vista' })).toBeTruthy();
  });

  it('treats a 409 on a batch as the 500-season limit and refreshes from the server', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view()).mockResolvedValueOnce(view(1));
    api.applySeasonBatch.mockRejectedValueOnce(new ApiError(409, 'x'));
    renderPanel([season(1), season(2)]);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar hasta Temporada 2' }));
    expect((await screen.findByRole('alert')).textContent).toContain('500');
    expect(
      await screen.findByRole('button', { name: 'Desmarcar Temporada 1 como vista' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Marcar Temporada 2 como vista' })).toBeTruthy();
  });

  it.each([
    [403, 'origen'],
    [413, 'demasiado grande'],
    [429, 'Demasiadas'],
    [503, 'no está disponible'],
    [400, 'no es válida'],
  ])('shows a safe message for %i without marking the season', async (status, text) => {
    api.getSeasonProgress.mockResolvedValueOnce(view());
    api.markSeasonComplete.mockRejectedValueOnce(new ApiError(status, 'prisma internal detail'));
    renderPanel([season(1)]);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar Temporada 1 como vista' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(text);
    expect(alert.textContent).not.toContain('prisma');
    expect(screen.getByRole('button', { name: 'Marcar Temporada 1 como vista' })).toBeTruthy();
  });

  it('does not mark as saved before the server confirms', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view());
    api.markSeasonComplete.mockReturnValueOnce(new Promise(() => undefined));
    renderPanel([season(1)]);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar Temporada 1 como vista' }));
    expect(screen.queryByRole('button', { name: 'Desmarcar Temporada 1 como vista' })).toBeNull();
    expect(screen.queryByText('Temporada 1 marcada como vista.')).toBeNull();
  });

  it('ignores a late load response after the entry changes', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    api.getSeasonProgress
      .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce({ libraryEntryId: 'entry-2', completedSeasons: [] });
    const { rerender } = render(
      <SeasonProgressPanel
        entryId="entry-1"
        seasons={[season(1)]}
        onUnauthorized={vi.fn()}
        today={TODAY}
      />,
    );
    rerender(
      <SeasonProgressPanel
        entryId="entry-2"
        seasons={[season(1)]}
        onUnauthorized={vi.fn()}
        today={TODAY}
      />,
    );
    await screen.findByRole('button', { name: 'Marcar Temporada 1 como vista' });
    resolveFirst(view(1));
    await Promise.resolve();
    expect(screen.getByRole('button', { name: 'Marcar Temporada 1 como vista' })).toBeTruthy();
  });

  it('ignores a late mutation response after the entry changes', async () => {
    api.getSeasonProgress
      .mockResolvedValueOnce(view())
      .mockResolvedValueOnce({ libraryEntryId: 'entry-2', completedSeasons: [] });
    let resolvePut: (value: unknown) => void = () => undefined;
    api.markSeasonComplete.mockReturnValueOnce(new Promise((r) => (resolvePut = r)));
    const { rerender } = render(
      <SeasonProgressPanel
        entryId="entry-1"
        seasons={[season(1)]}
        onUnauthorized={vi.fn()}
        today={TODAY}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar Temporada 1 como vista' }));
    rerender(
      <SeasonProgressPanel
        entryId="entry-2"
        seasons={[season(1)]}
        onUnauthorized={vi.fn()}
        today={TODAY}
      />,
    );
    await screen.findByRole('button', { name: 'Marcar Temporada 1 como vista' });
    resolvePut({ seasonNumber: 1, completedAt: '2026-01-01T00:00:00.000Z' });
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByRole('button', { name: 'Marcar Temporada 1 como vista' })).toBeTruthy();
    expect(screen.queryByText('Temporada 1 marcada como vista.')).toBeNull();
  });

  it('does not offer «Marcar hasta» for specials, upcoming or the first pending season', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view());
    renderPanel([season(0), season(1), season(2, { airDate: '2030-01-01' })]);
    await screen.findByRole('progressbar');
    expect(screen.queryByRole('button', { name: /Marcar hasta/ })).toBeNull();
  });

  it('only sends eligible pending seasons in «Marcar hasta», skipping gaps and completed ones', async () => {
    api.getSeasonProgress.mockResolvedValueOnce(view(2));
    api.applySeasonBatch.mockResolvedValueOnce(view(1, 2, 5));
    renderPanel([season(0), season(1), season(2), season(5), season(7, { airDate: '2030-01-01' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar hasta Temporada 5' }));
    await screen.findByRole('button', { name: 'Desmarcar Temporada 5 como vista' });
    expect(api.applySeasonBatch).toHaveBeenCalledWith('entry-1', { complete: [1, 5] });
  });
});
