// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  LibraryEntryView,
  LibraryListQuery,
  LibraryListResponse,
  RatingView,
} from '@garquinsfilm/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api.js';

const libraryApi = vi.hoisted(() => ({
  listLibrary: vi.fn(),
  updateLibraryEntry: vi.fn(),
  deleteLibraryEntry: vi.fn(),
}));
const ratingsApi = vi.hoisted(() => ({
  getRating: vi.fn(),
  putRating: vi.fn(),
  deleteRating: vi.fn(),
}));

vi.mock('./library.api.js', () => libraryApi);
vi.mock('../ratings/ratings.api.js', () => ratingsApi);

import { LibraryPage } from './LibraryPage.js';

const entry: LibraryEntryView = {
  id: 'entry-1',
  source: 'tmdb',
  type: 'movie',
  tmdbId: 812,
  status: 'PENDING',
  isFavorite: false,
  addedAt: '2026-10-29T12:00:00.000Z',
  updatedAt: '2026-10-29T12:00:00.000Z',
  completedAt: null,
  media: null,
};
const savedRating: RatingView = {
  libraryEntryId: entry.id,
  score: 8.4,
  review: 'Mi reseña',
  containsSpoilers: false,
  createdAt: '2026-10-29T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
};

function response(
  results: LibraryEntryView[] = [entry],
  totalResults = results.length,
  totalPages = totalResults ? 1 : 0,
): LibraryListResponse {
  return { page: 1, totalPages, totalResults, results };
}

beforeEach(() => {
  vi.clearAllMocks();
  const storage = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  });
  window.localStorage.clear();
  libraryApi.listLibrary.mockResolvedValue(response());
  libraryApi.updateLibraryEntry.mockResolvedValue(entry);
  libraryApi.deleteLibraryEntry.mockResolvedValue(undefined);
  ratingsApi.getRating.mockResolvedValue(null);
  ratingsApi.putRating.mockImplementation(async (_id: string, input: unknown) => ({
    libraryEntryId: entry.id,
    ...(input as object),
    createdAt: entry.addedAt,
    updatedAt: entry.updatedAt,
  }));
  ratingsApi.deleteRating.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('LibraryPage', () => {
  it('muestra la biblioteca con media null sin inventar título ni imagen', async () => {
    render(<LibraryPage onUnauthorized={vi.fn()} />);

    expect(await screen.findByText('Título no disponible')).toBeTruthy();
    expect(screen.getByText('Película · TMDB ID 812')).toBeTruthy();
    expect(
      (screen.getByLabelText('Estado de Título no disponible') as HTMLSelectElement).value,
    ).toBe('PENDING');
    expect(
      screen.getByRole('button', { name: 'Añadir Título no disponible a favoritos' }),
    ).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(libraryApi.listLibrary).toHaveBeenCalledWith(
      {
        page: 1,
        pageSize: 20,
        sortBy: 'addedAt',
        sortOrder: 'desc',
      } satisfies LibraryListQuery,
      expect.any(AbortSignal),
    );
  });

  it('abre el editor de su propia entrada y guarda sin modificar el estado de biblioteca', async () => {
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    await screen.findByText('Título no disponible');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Puntuar y reseñar de Título no disponible' }),
    );
    await screen.findByRole('button', { name: 'Guardar valoración' });
    expect(ratingsApi.getRating).toHaveBeenCalledWith(entry.id);
    fireEvent.change(screen.getByRole('spinbutton', { name: /Tu puntuación/ }), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));

    await waitFor(() => {
      expect(ratingsApi.putRating).toHaveBeenCalledWith(entry.id, {
        score: 0,
        review: null,
        containsSpoilers: false,
      });
    });
    expect(await screen.findByText('Tu valoración se guardó correctamente.')).toBeTruthy();
    expect(libraryApi.updateLibraryEntry).not.toHaveBeenCalled();
    expect(libraryApi.deleteLibraryEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar editor de valoración' }));
    expect(
      await screen.findByRole('button', {
        name: 'Mi valoración · 0,0/10 de Título no disponible',
      }),
    ).toBeTruthy();
  });

  it('muestra la puntuación existente desde la tarjeta y reutiliza la lectura al editar', async () => {
    ratingsApi.getRating.mockResolvedValueOnce(savedRating);
    render(<LibraryPage onUnauthorized={vi.fn()} />);

    expect(
      await screen.findByRole('button', {
        name: 'Mi valoración · 8,4/10 de Título no disponible',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Mi reseña')).toBeTruthy();
    expect(ratingsApi.getRating).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Mi valoración · 8,4/10 de Título no disponible',
      }),
    );
    expect(await screen.findByDisplayValue('Mi reseña')).toBeTruthy();
    expect(ratingsApi.getRating).toHaveBeenCalledOnce();
  });

  it('bloquea el acceso al editor mientras carga la valoración inicial', async () => {
    let resolveRating: (rating: RatingView | null) => void = () => {};
    ratingsApi.getRating.mockReturnValueOnce(
      new Promise<RatingView | null>((resolve) => {
        resolveRating = resolve;
      }),
    );
    render(<LibraryPage onUnauthorized={vi.fn()} />);

    const loadingButton = await screen.findByRole('button', {
      name: 'Cargando valoración… de Título no disponible',
    });
    expect(loadingButton).toHaveProperty('disabled', true);

    await act(async () => resolveRating(null));
    expect(
      await screen.findByRole('button', {
        name: 'Puntuar y reseñar de Título no disponible',
      }),
    ).toBeTruthy();
  });

  it('distingue una biblioteca vacía de filtros sin resultados', async () => {
    libraryApi.listLibrary.mockResolvedValue(response([], 0, 0));
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Tu biblioteca está vacía' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), {
      target: { value: 'tv' },
    });
    expect(
      await screen.findByRole('heading', { name: 'No hay resultados con estos filtros' }),
    ).toBeTruthy();
  });

  it('valida y persiste la preferencia grid/list en localStorage', async () => {
    window.localStorage.setItem('garquinsfilm:library-view', 'unexpected');
    const { unmount } = render(<LibraryPage onUnauthorized={vi.fn()} />);

    const grid = screen.getByRole('button', { name: 'Vista de cuadrícula' });
    const list = screen.getByRole('button', { name: 'Vista de lista' });
    expect(grid.getAttribute('aria-pressed')).toBe('true');
    expect(list.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(list);
    expect(list.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => {
      expect(window.localStorage.getItem('garquinsfilm:library-view')).toBe('list');
    });
    unmount();
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Vista de lista' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('envía filtros y orden al backend y vuelve a la primera página al cambiarlos', async () => {
    libraryApi.listLibrary.mockImplementation(async (query: LibraryListQuery) =>
      response([entry], 21, query.page === 1 ? 2 : 2),
    );
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    await screen.findByText('Título no disponible');

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => {
      expect(libraryApi.listLibrary).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal),
      );
    });

    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: 'tv' } });
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), {
      target: { value: 'WATCHING' },
    });
    fireEvent.change(screen.getByLabelText('Filtrar por favoritos'), {
      target: { value: 'favorites' },
    });
    fireEvent.change(screen.getByLabelText('Ordenar por'), {
      target: { value: 'updatedAt:asc' },
    });

    await waitFor(() => {
      expect(libraryApi.listLibrary).toHaveBeenLastCalledWith(
        {
          type: 'tv',
          status: 'WATCHING',
          favorite: true,
          page: 1,
          pageSize: 20,
          sortBy: 'updatedAt',
          sortOrder: 'asc',
        },
        expect.any(AbortSignal),
      );
    });
  });

  it('cambia estado y favorito mediante PATCH sin mezclar ambos campos', async () => {
    let updated = entry;
    libraryApi.listLibrary.mockImplementation(async () => response([updated]));
    libraryApi.updateLibraryEntry.mockImplementation(
      async (_id: string, patch: { status?: LibraryEntryView['status']; isFavorite?: boolean }) => {
        updated = { ...updated, ...patch };
        return updated;
      },
    );
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    await screen.findByText('Título no disponible');

    fireEvent.change(screen.getByLabelText('Estado de Título no disponible'), {
      target: { value: 'COMPLETED' },
    });
    await waitFor(() => {
      expect(libraryApi.updateLibraryEntry).toHaveBeenCalledWith('entry-1', {
        status: 'COMPLETED',
      });
      expect(
        (screen.getByLabelText('Estado de Título no disponible') as HTMLSelectElement).value,
      ).toBe('COMPLETED');
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Añadir Título no disponible a favoritos' }),
    );
    await waitFor(() => {
      expect(libraryApi.updateLibraryEntry).toHaveBeenLastCalledWith('entry-1', {
        isFavorite: true,
      });
      expect(
        screen
          .getByRole('button', { name: 'Quitar Título no disponible de favoritos' })
          .getAttribute('aria-pressed'),
      ).toBe('true');
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Quitar Título no disponible de favoritos' }),
    );
    await waitFor(() => {
      expect(libraryApi.updateLibraryEntry).toHaveBeenLastCalledWith('entry-1', {
        isFavorite: false,
      });
      expect(
        screen
          .getByRole('button', { name: 'Añadir Título no disponible a favoritos' })
          .getAttribute('aria-pressed'),
      ).toBe('false');
    });
    expect(screen.getByRole('status').textContent).toContain('El cambio se guardó');
  });

  it('muestra errores de autorización de una modificación sin filtrar mensajes internos', async () => {
    libraryApi.updateLibraryEntry.mockRejectedValueOnce(
      new ApiError(403, 'private database detail'),
    );
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    await screen.findByText('Título no disponible');

    fireEvent.click(
      screen.getByRole('button', { name: 'Añadir Título no disponible a favoritos' }),
    );

    expect(await screen.findByText('No tienes permiso para realizar esta acción.')).toBeTruthy();
    expect(screen.queryByText('private database detail')).toBeNull();
  });

  it('ignora clics simultáneos de favorito mientras el PATCH sigue pendiente', async () => {
    let resolveUpdate: ((value: LibraryEntryView) => void) | undefined;
    libraryApi.updateLibraryEntry.mockImplementationOnce(
      () =>
        new Promise<LibraryEntryView>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    await screen.findByText('Título no disponible');

    const favoriteButton = screen.getByRole('button', {
      name: 'Añadir Título no disponible a favoritos',
    });
    fireEvent.click(favoriteButton);
    fireEvent.click(favoriteButton);

    expect(libraryApi.updateLibraryEntry).toHaveBeenCalledOnce();
    expect(favoriteButton.hasAttribute('disabled')).toBe(true);
    resolveUpdate?.({ ...entry, isFavorite: true });
    await waitFor(() => {
      expect(screen.getByText('El cambio se guardó correctamente.')).toBeTruthy();
    });
  });

  it('trata 404 como entrada obsoleta y 503 como fallo temporal recuperable', async () => {
    libraryApi.updateLibraryEntry.mockRejectedValueOnce(new ApiError(404, 'missing'));
    const { rerender } = render(<LibraryPage onUnauthorized={vi.fn()} />);
    await screen.findByText('Título no disponible');
    fireEvent.click(
      screen.getByRole('button', { name: 'Añadir Título no disponible a favoritos' }),
    );
    expect(
      await screen.findByText('La entrada ya no está disponible. Se actualizará la biblioteca.'),
    ).toBeTruthy();
    await waitFor(() => expect(libraryApi.listLibrary).toHaveBeenCalledTimes(2));

    libraryApi.updateLibraryEntry.mockRejectedValueOnce(new ApiError(503, 'unavailable'));
    rerender(<LibraryPage onUnauthorized={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Añadir Título no disponible a favoritos' }),
    );
    expect(
      await screen.findByText(
        'El servicio no está disponible ahora. Inténtalo de nuevo más tarde.',
      ),
    ).toBeTruthy();
  });

  it('confirma antes de eliminar y permite cancelar con Escape', async () => {
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    await screen.findByText('Título no disponible');
    const deleteButton = screen.getByRole('button', { name: 'Eliminar' });

    fireEvent.click(deleteButton);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(libraryApi.deleteLibraryEntry).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleteButton).toBe(document.activeElement);

    fireEvent.click(deleteButton);
    const confirmButton = screen.getByRole('button', { name: 'Sí, eliminar' });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    await waitFor(() => {
      expect(libraryApi.deleteLibraryEntry).toHaveBeenCalledWith('entry-1');
    });
    expect(libraryApi.deleteLibraryEntry).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Mi biblioteca' }));
    });
  });

  it('muestra errores de red y redirige cuando la sesión ha caducado', async () => {
    libraryApi.listLibrary.mockRejectedValueOnce(new ApiError(0, 'network'));
    const { rerender } = render(<LibraryPage onUnauthorized={vi.fn()} />);
    expect(
      await screen.findByText('No se pudo conectar con el servidor. Comprueba tu conexión.'),
    ).toBeTruthy();

    const onUnauthorized = vi.fn();
    libraryApi.listLibrary.mockRejectedValueOnce(new ApiError(401, 'unauthorized'));
    rerender(<LibraryPage onUnauthorized={onUnauthorized} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce());
    expect(await screen.findByText('Tu sesión ha caducado. Vuelve a iniciar sesión.')).toBeTruthy();
  });

  it('ignora resultados desactualizados de consultas anteriores', async () => {
    let resolveFirst: ((value: LibraryListResponse) => void) | undefined;
    libraryApi.listLibrary
      .mockImplementationOnce(
        () =>
          new Promise<LibraryListResponse>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(
        response([
          {
            ...entry,
            id: 'entry-tv',
            type: 'tv',
            tmdbId: 999,
            media: null,
          },
        ]),
      );
    render(<LibraryPage onUnauthorized={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Filtrar por tipo'), { target: { value: 'tv' } });
    expect(await screen.findByText('Serie · TMDB ID 999')).toBeTruthy();

    resolveFirst?.(response([{ ...entry, id: 'stale-entry', tmdbId: 111 }]));
    await waitFor(() => {
      expect(screen.queryByText('Película · TMDB ID 111')).toBeNull();
    });
  });
});
