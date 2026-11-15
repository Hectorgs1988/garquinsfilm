// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MediaDetail, MediaSearchResponse, MediaSummary } from '@garquinsfilm/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api.js';

const catalogApi = vi.hoisted(() => ({
  searchCatalog: vi.fn(),
  getMediaDetail: vi.fn(),
}));
vi.mock('./catalog.api.js', () => catalogApi);

import { CatalogPage } from './CatalogPage.js';

function summary(overrides: Partial<MediaSummary> = {}): MediaSummary {
  return {
    source: 'tmdb',
    type: 'movie',
    tmdbId: 438631,
    title: 'Dune',
    originalTitle: 'Dune',
    year: 2021,
    overview: 'Arrakis.',
    posterUrl: null,
    voteAverage: 7.8,
    voteCount: 11000,
    ...overrides,
  };
}

function response(results: MediaSummary[], overrides: Partial<MediaSearchResponse> = {}) {
  return {
    page: 1,
    totalPages: 1,
    totalResults: results.length,
    results,
    ...overrides,
  } as MediaSearchResponse;
}

const detail: MediaDetail = {
  ...summary(),
  type: 'movie',
  cast: [],
  directors: [],
  videos: [],
  trailer: null,
  watchProviders: {
    region: 'ES',
    attribution: 'JustWatch',
    link: null,
    subscription: [],
    rent: [],
    buy: [],
  },
  releaseDate: '2021-09-15',
  runtime: 155,
  genres: [],
  status: 'Released',
  backdropUrl: null,
  tagline: null,
};

// Sin antirrebote los tests no tienen que esperar al temporizador.
function renderPage(onUnauthorized = vi.fn()) {
  render(<CatalogPage onUnauthorized={onUnauthorized} debounceMs={0} />);
  return { onUnauthorized };
}

async function search(text: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar películas o series' }), {
    target: { value: text },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  catalogApi.searchCatalog.mockResolvedValue(response([summary()]));
  catalogApi.getMediaDetail.mockResolvedValue(detail);
});

afterEach(cleanup);

describe('catálogo conectado a TMDB', () => {
  it('no busca nada hasta que se escribe', () => {
    renderPage();

    expect(screen.getByText('Empieza por un título')).toBeTruthy();
    expect(catalogApi.searchCatalog).not.toHaveBeenCalled();
  });

  it('busca lo que se escribe y muestra los resultados', async () => {
    renderPage();
    await search('dune');

    expect(await screen.findByRole('button', { name: 'Ver detalles de Dune' })).toBeTruthy();
    expect(catalogApi.searchCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'dune', type: 'all', page: 1 }),
    );
  });

  it('pasa el filtro de tipo a la búsqueda', async () => {
    renderPage();
    await search('dune');
    await screen.findByRole('button', { name: 'Ver detalles de Dune' });

    fireEvent.click(screen.getByRole('button', { name: 'Series' }));

    await waitFor(() => {
      expect(catalogApi.searchCatalog).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'tv', page: 1 }),
      );
    });
  });

  it('vuelve a la primera página al cambiar la búsqueda', async () => {
    catalogApi.searchCatalog.mockResolvedValue(
      response([summary()], { page: 1, totalPages: 3, totalResults: 60 }),
    );
    renderPage();
    await search('dune');
    await screen.findByRole('button', { name: 'Siguiente' });

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => {
      expect(catalogApi.searchCatalog).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      );
    });

    await search('otra cosa');
    await waitFor(() => {
      expect(catalogApi.searchCatalog).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: 'otra cosa', page: 1 }),
      );
    });
  });

  it('avisa cuando no hay resultados', async () => {
    catalogApi.searchCatalog.mockResolvedValue(response([]));
    renderPage();
    await search('zzzzzz');

    expect(await screen.findByText('No encontramos resultados')).toBeTruthy();
  });

  it('permite reintentar cuando la búsqueda falla', async () => {
    catalogApi.searchCatalog.mockRejectedValueOnce(new ApiError(503, 'down'));
    renderPage();
    await search('dune');

    expect((await screen.findByRole('alert')).textContent).toContain('no está disponible');

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Ver detalles de Dune' })).toBeTruthy();
  });

  it('avisa de la sesión caducada en lugar de mostrar un error', async () => {
    catalogApi.searchCatalog.mockRejectedValueOnce(new ApiError(401, 'unauthorized'));
    const { onUnauthorized } = renderPage();
    await search('dune');

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('abre la ficha y pide su detalle ampliado', async () => {
    renderPage();
    await search('dune');
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalles de Dune' }));

    expect(screen.getByRole('heading', { name: 'Dune', level: 1 })).toBeTruthy();
    await waitFor(() => {
      expect(catalogApi.getMediaDetail).toHaveBeenCalledWith('movie', 438631, expect.anything());
    });
  });

  it('mantiene la ficha básica si el detalle no se puede ampliar', async () => {
    catalogApi.getMediaDetail.mockRejectedValueOnce(new ApiError(503, 'down'));
    renderPage();
    await search('dune');
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalles de Dune' }));

    expect(await screen.findByText(/No se pudo cargar la información ampliada/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Dune', level: 1 })).toBeTruthy();
  });

  it('conserva la búsqueda y el filtro al volver del detalle', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Películas' }));
    await search('dune');
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalles de Dune' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver a explorar' }));

    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('dune');
    expect(screen.getByRole('button', { name: 'Películas' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('muestra la atribución que exige la licencia de TMDB', async () => {
    renderPage();

    expect(
      screen.getByText('This product uses the TMDB API but is not endorsed or certified by TMDB.'),
    ).toBeTruthy();
  });
});
