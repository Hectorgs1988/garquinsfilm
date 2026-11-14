// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProfileStatsView } from '@garquinsfilm/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api.js';

const statsApi = vi.hoisted(() => ({ getProfileStats: vi.fn() }));
vi.mock('./stats.api.js', () => statsApi);

import { ProfileStats } from './ProfileStats.js';

const stats: ProfileStatsView = {
  movies: { completed: 12, pending: 3 },
  series: { completed: 4, pending: 1 },
  ratings: { average: 8.3, count: 9 },
};

function renderStats() {
  const onUnauthorized = vi.fn();
  render(<ProfileStats onUnauthorized={onUnauthorized} />);
  return { onUnauthorized };
}

beforeEach(() => {
  vi.clearAllMocks();
  statsApi.getProfileStats.mockResolvedValue(stats);
});

afterEach(cleanup);

describe('ProfileStats', () => {
  it('muestra cada cifra con su etiqueta', async () => {
    renderStats();

    const vistas = await screen.findByText('Películas vistas');
    expect(vistas.parentElement?.textContent).toContain('12');
    expect(screen.getByText('Series terminadas').parentElement?.textContent).toContain('4');
  });

  it('suma los pendientes y desglosa el reparto', async () => {
    renderStats();

    const pendientes = await screen.findByText('Pendientes');
    const card = pendientes.parentElement;
    expect(card?.textContent).toContain('4');
    expect(card?.textContent).toContain('3 películas · 1 serie');
  });

  it('escribe la nota media en formato español', async () => {
    renderStats();

    expect(await screen.findByText('8,3')).toBeTruthy();
    expect(screen.getByText('9 valoraciones')).toBeTruthy();
  });

  it('no inventa un cero cuando todavía no hay valoraciones', async () => {
    statsApi.getProfileStats.mockResolvedValue({
      ...stats,
      ratings: { average: null, count: 0 },
    });
    renderStats();

    expect(await screen.findByText('Sin valoraciones')).toBeTruthy();
    expect(screen.queryByText('0,0')).toBeNull();
  });

  it('usa el singular con una sola unidad', async () => {
    statsApi.getProfileStats.mockResolvedValue({
      movies: { completed: 1, pending: 1 },
      series: { completed: 1, pending: 0 },
      ratings: { average: 10, count: 1 },
    });
    renderStats();

    expect(await screen.findByText('1 película · 0 series')).toBeTruthy();
    expect(screen.getByText('1 valoración')).toBeTruthy();
    expect(screen.getByText('10,0')).toBeTruthy();
  });

  it('omite el desglose cuando no hay nada pendiente', async () => {
    statsApi.getProfileStats.mockResolvedValue({
      ...stats,
      movies: { completed: 12, pending: 0 },
      series: { completed: 4, pending: 0 },
    });
    renderStats();

    await screen.findByText('Pendientes');
    expect(screen.queryByText(/películas ·/)).toBeNull();
  });

  it('permite reintentar cuando la carga falla', async () => {
    statsApi.getProfileStats.mockRejectedValueOnce(new ApiError(503, 'down'));
    renderStats();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No se pudieron cargar tus estadísticas.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Películas vistas')).toBeTruthy();
    expect(statsApi.getProfileStats).toHaveBeenCalledTimes(2);
  });

  it('avisa de la sesión caducada en lugar de mostrar un error', async () => {
    statsApi.getProfileStats.mockRejectedValueOnce(new ApiError(401, 'unauthorized'));
    const { onUnauthorized } = renderStats();

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
