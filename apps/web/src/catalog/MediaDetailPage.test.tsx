// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovieDetail, TvDetail } from '@garquinsfilm/shared';

import { DEMO_DETAILS } from './catalog.mock.js';
import { MediaDetailPage } from './MediaDetailPage.js';
import { ApiError } from '../api.js';

const libraryApi = vi.hoisted(() => ({
  createLibraryEntry: vi.fn(),
}));

vi.mock('../library/library.api.js', () => libraryApi);

const movie = DEMO_DETAILS.find((item) => item.type === 'movie') as MovieDetail;
const tv = DEMO_DETAILS.find((item) => item.type === 'tv') as TvDetail;

afterEach(cleanup);

describe('MediaDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('añade solo la identidad al backend y representa estado inicial y duplicado', async () => {
    libraryApi.createLibraryEntry.mockResolvedValueOnce({});
    render(<MediaDetailPage media={movie} onBack={vi.fn()} isDemo />);

    fireEvent.click(screen.getByRole('button', { name: 'Añadir a mi biblioteca' }));
    expect(await screen.findByText('Se añadió con estado Pendiente.')).toBeTruthy();
    expect(libraryApi.createLibraryEntry).toHaveBeenCalledWith({
      source: 'tmdb',
      type: 'movie',
      tmdbId: movie.tmdbId,
    });

    cleanup();
    libraryApi.createLibraryEntry.mockRejectedValueOnce(
      new ApiError(409, 'This title is already in your library.'),
    );
    render(<MediaDetailPage media={movie} onBack={vi.fn()} isDemo />);
    fireEvent.click(screen.getByRole('button', { name: 'Añadir a mi biblioteca' }));

    expect(await screen.findByRole('button', { name: 'Ya está en mi biblioteca' })).toBeTruthy();
    expect(
      screen.getByText('Este título ya estaba añadido; no se creó un duplicado.'),
    ).toBeTruthy();
  });

  it('evita múltiples POST al pulsar rápidamente el botón de alta', async () => {
    let resolveCreate: ((value: unknown) => void) | undefined;
    libraryApi.createLibraryEntry.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(<MediaDetailPage media={movie} onBack={vi.fn()} isDemo />);

    const addButton = screen.getByRole('button', { name: 'Añadir a mi biblioteca' });
    fireEvent.click(addButton);
    fireEvent.click(addButton);

    expect(libraryApi.createLibraryEntry).toHaveBeenCalledOnce();
    expect(addButton.hasAttribute('disabled')).toBe(true);
    resolveCreate?.({});
    expect(await screen.findByText('Se añadió con estado Pendiente.')).toBeTruthy();
  });

  it('renderiza metadatos de película, reparto, dirección y disponibilidad ficticia', () => {
    render(<MediaDetailPage media={movie} onBack={vi.fn()} isDemo />);

    expect(screen.getByRole('heading', { name: movie.title, level: 1 })).toBeTruthy();
    expect(screen.getByText(/Más allá de lo conocido/)).toBeTruthy();
    expect(screen.getByText('2 h 8 min')).toBeTruthy();
    expect(screen.getByText('Estrenada')).toBeTruthy();
    expect(screen.getByText('Ciencia ficción')).toBeTruthy();
    expect(screen.getByText('Elena Vega')).toBeTruthy();
    expect(screen.getByText('Adrián Montes')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Suscripción' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Alquiler' })).toBeTruthy();
    expect(
      screen.getByText(
        'Disponibilidad ficticia de demostración; no representa servicios ni disponibilidad reales.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Atribución: JustWatch/)).toBeTruthy();
  });

  it('renderiza temporadas de series y reconoce los especiales de temporada cero', () => {
    const detail: TvDetail = {
      ...tv,
      seasons: [
        ...tv.seasons,
        {
          seasonNumber: 0,
          name: 'Especiales',
          episodeCount: 2,
          airDate: null,
          posterUrl: null,
          isSpecial: true,
        },
      ],
    };
    render(<MediaDetailPage media={detail} onBack={vi.fn()} isDemo />);

    expect(screen.getByText('2 temporadas')).toBeTruthy();
    expect(screen.getByText('16 episodios')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Temporadas' })).toBeTruthy();
    expect(screen.getByText('Temporada 1')).toBeTruthy();
    expect(screen.getByText('Especiales')).toBeTruthy();
    expect(screen.getByText('Marina Soler')).toBeTruthy();
  });

  it('maneja opcionales ausentes, lista de créditos vacía y proveedores no disponibles', () => {
    const sparseMovie: MovieDetail = {
      ...movie,
      year: null,
      overview: null,
      voteAverage: null,
      voteCount: null,
      releaseDate: null,
      runtime: null,
      genres: [],
      status: null,
      tagline: null,
      cast: [],
      directors: [],
      watchProviders: {
        ...movie.watchProviders,
        link: null,
        subscription: [],
        rent: [],
        buy: [],
      },
    };
    render(<MediaDetailPage media={sparseMovie} onBack={vi.fn()} />);

    expect(
      screen.getByText('Todavía no tenemos una sinopsis disponible para este título.'),
    ).toBeTruthy();
    expect(screen.getByText('No hay información del reparto disponible.')).toBeTruthy();
    expect(screen.getByText('No hay información disponible.')).toBeTruthy();
    expect(screen.getByText('No hay disponibilidad de streaming para mostrar.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /JustWatch/ })).toBeNull();
  });

  it('usa la vista compacta de póster móvil y una alternativa textual accesible', () => {
    const { container } = render(
      <MediaDetailPage media={{ ...movie, posterUrl: '/fictional-poster.png' }} onBack={vi.fn()} />,
    );
    expect(screen.getByRole('img', { name: `Póster de ${movie.title}` })).toBeTruthy();
    expect(
      container
        .querySelector('[aria-labelledby="media-detail-title"] .grid')
        ?.classList.contains('grid-cols-[minmax(0,1fr)_6.5rem]'),
    ).toBe(true);
    expect(
      screen
        .getByRole('img', { name: `Póster de ${movie.title}` })
        .parentElement?.parentElement?.classList.contains('col-start-2'),
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Volver a explorar' })).toBeTruthy();
  });
});
