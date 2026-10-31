// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MovieDetail, TvDetail } from '@garquinsfilm/shared';

import { DEMO_DETAILS } from './catalog.mock.js';
import { MediaDetailPage } from './MediaDetailPage.js';

const movie = DEMO_DETAILS.find((item) => item.type === 'movie') as MovieDetail;
const tv = DEMO_DETAILS.find((item) => item.type === 'tv') as TvDetail;

afterEach(cleanup);

describe('MediaDetailPage', () => {
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
