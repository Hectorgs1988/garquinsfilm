// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RatingPutInput, RatingView } from '@garquinsfilm/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api.js';

const ratingApi = vi.hoisted(() => ({
  getRating: vi.fn(),
  putRating: vi.fn(),
  deleteRating: vi.fn(),
}));
vi.mock('./ratings.api.js', () => ratingApi);

import { RatingDialog } from './RatingDialog.js';

const savedRating: RatingView = {
  libraryEntryId: 'entry-1',
  score: 7.8,
  review: 'Una reseña previa',
  containsSpoilers: false,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
};

function renderDialog(onRatingChange = vi.fn(), onUnauthorized = vi.fn()) {
  return render(
    <RatingDialog
      entryId="entry-1"
      title="Película de prueba"
      onClose={vi.fn()}
      onUnauthorized={onUnauthorized}
      onRatingChange={onRatingChange}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  ratingApi.getRating.mockResolvedValue(null);
  ratingApi.putRating.mockImplementation(
    async (_entryId: string, input: RatingPutInput): Promise<RatingView> => ({
      ...savedRating,
      ...input,
    }),
  );
  ratingApi.deleteRating.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('RatingDialog', () => {
  it('shows loading and prevents saves before the private rating has loaded', async () => {
    let resolveRating: ((value: RatingView | null) => void) | undefined;
    ratingApi.getRating.mockImplementationOnce(
      () =>
        new Promise<RatingView | null>((resolve) => {
          resolveRating = resolve;
        }),
    );
    renderDialog();
    expect(screen.getByRole('status').textContent).toContain('Cargando valoración');
    expect(screen.queryByRole('button', { name: 'Guardar valoración' })).toBeNull();
    expect(ratingApi.putRating).not.toHaveBeenCalled();
    resolveRating?.(null);
    expect(await screen.findByRole('button', { name: 'Guardar valoración' })).toBeTruthy();
  });

  it('loads an absent rating and saves score zero as distinct from null', async () => {
    const onRatingChange = vi.fn();
    renderDialog(onRatingChange);
    await screen.findByRole('button', { name: 'Guardar valoración' });
    expect(
      screen.getByRole('spinbutton', { name: /Tu puntuación/ }).getAttribute('placeholder'),
    ).toBe('Sin puntuación');

    fireEvent.change(screen.getByRole('spinbutton', { name: /Tu puntuación/ }), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));
    await waitFor(() => {
      expect(ratingApi.putRating).toHaveBeenCalledWith('entry-1', {
        score: 0,
        review: null,
        containsSpoilers: false,
      });
    });
    expect(await screen.findByText('Tu valoración se guardó correctamente.')).toBeTruthy();
    expect(onRatingChange).toHaveBeenLastCalledWith(expect.objectContaining({ score: 0 }));
  });

  it('allows a review without score and counts code points, not UTF-16 units', async () => {
    ratingApi.putRating.mockImplementationOnce(
      async (_id: string, input: RatingPutInput): Promise<RatingView> => ({
        ...savedRating,
        ...input,
      }),
    );
    renderDialog();
    await screen.findByRole('button', { name: 'Guardar valoración' });
    const textarea = screen.getByRole('textbox', { name: /Reseña \(opcional\)/ });
    const text = `🙂${'a'.repeat(1_999)}`;
    fireEvent.change(textarea, { target: { value: text } });
    expect(screen.getByLabelText('Reseña: 2000 de 2000 caracteres')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));
    await waitFor(() => {
      expect(ratingApi.putRating).toHaveBeenCalledWith('entry-1', {
        score: null,
        review: text,
        containsSpoilers: false,
      });
    });
  });

  it('normalizes review line endings, supports spoilers, and rejects text over 2,000 code points', async () => {
    renderDialog();
    await screen.findByRole('button', { name: 'Guardar valoración' });
    const spoilerCheckbox = screen.getByRole('checkbox', {
      name: 'Esta reseña contiene spoilers',
    });
    expect(spoilerCheckbox.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: /Reseña \(opcional\)/ }), {
      target: { value: '  primera\r\nsegunda  ' },
    });
    fireEvent.click(spoilerCheckbox);
    fireEvent.change(screen.getByRole('spinbutton', { name: /Tu puntuación/ }), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));
    await waitFor(() => {
      expect(ratingApi.putRating).toHaveBeenCalledWith('entry-1', {
        score: 10,
        review: 'primera\nsegunda',
        containsSpoilers: true,
      });
    });

    cleanup();
    vi.clearAllMocks();
    ratingApi.getRating.mockResolvedValue(null);
    renderDialog();
    await screen.findByRole('button', { name: 'Guardar valoración' });
    fireEvent.change(screen.getByRole('textbox', { name: /Reseña \(opcional\)/ }), {
      target: { value: '🙂'.repeat(2_001) },
    });
    expect(screen.getByLabelText('Reseña: 2001 de 2000 caracteres')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'La reseña no puede superar los 2.000 caracteres.',
    );
    expect(ratingApi.putRating).not.toHaveBeenCalled();
  });

  it('rejects empty records and invalid decimal scores without sending a request', async () => {
    renderDialog();
    await screen.findByRole('button', { name: 'Guardar valoración' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Añade una puntuación o una reseña para guardar.',
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: /Tu puntuación/ }), {
      target: { value: '7.85' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'La puntuación debe estar entre 0 y 10, en pasos de 0,1.',
    );
    expect(ratingApi.putRating).not.toHaveBeenCalled();
  });

  it('loads an existing rating, updates it, then confirms and deletes it', async () => {
    const onRatingChange = vi.fn();
    ratingApi.getRating.mockResolvedValueOnce(savedRating);
    renderDialog(onRatingChange);
    await screen.findByDisplayValue('Una reseña previa');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy();

    fireEvent.change(screen.getByRole('spinbutton', { name: /Tu puntuación/ }), {
      target: { value: '8.2' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(ratingApi.putRating).toHaveBeenCalledOnce());
    expect(await screen.findByText('Tu valoración se guardó correctamente.')).toBeTruthy();
    expect(onRatingChange).toHaveBeenLastCalledWith(expect.objectContaining({ score: 8.2 }));

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar valoración' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
    await waitFor(() => expect(ratingApi.deleteRating).toHaveBeenCalledWith('entry-1'));
    expect(onRatingChange).toHaveBeenLastCalledWith(null);
    expect((await screen.findByRole('status')).textContent).toContain('Tu valoración se eliminó');
  });

  it('blocks duplicate saves while the server request is pending', async () => {
    let resolveSave: ((value: RatingView) => void) | undefined;
    let pendingInput: RatingPutInput = { score: null, review: null, containsSpoilers: false };
    ratingApi.putRating.mockImplementationOnce(
      (_entryId: string, input: RatingPutInput) =>
        new Promise<RatingView>((resolve) => {
          resolveSave = resolve;
          pendingInput = input;
        }),
    );
    renderDialog();
    await screen.findByRole('button', { name: 'Guardar valoración' });
    fireEvent.change(screen.getByRole('spinbutton', { name: /Tu puntuación/ }), {
      target: { value: '5' },
    });
    const saveButton = screen.getByRole('button', { name: 'Guardar valoración' });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    expect(ratingApi.putRating).toHaveBeenCalledOnce();
    expect(saveButton.hasAttribute('disabled')).toBe(true);
    resolveSave?.({ ...savedRating, ...pendingInput });
    expect(await screen.findByText('Tu valoración se guardó correctamente.')).toBeTruthy();
  });

  it('asks before discarding edited text and retains it when the user continues editing', async () => {
    ratingApi.getRating.mockResolvedValueOnce(savedRating);
    renderDialog();
    await screen.findByDisplayValue('Una reseña previa');
    fireEvent.change(screen.getByRole('textbox', { name: /Reseña \(opcional\)/ }), {
      target: { value: 'Texto que quiero conservar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar editor de valoración' }));
    expect(screen.getByRole('alertdialog').textContent).toContain('¿Descartar los cambios?');
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByDisplayValue('Texto que quiero conservar')).toBeTruthy();
    expect(ratingApi.putRating).not.toHaveBeenCalled();
  });

  it('keeps unsaved input on a 503 and offers explicit reload after a 409', async () => {
    ratingApi.putRating.mockRejectedValueOnce(new ApiError(503, 'unavailable'));
    ratingApi.getRating.mockResolvedValueOnce(null).mockResolvedValueOnce(savedRating);
    renderDialog();
    await screen.findByRole('button', { name: 'Guardar valoración' });
    fireEvent.change(screen.getByRole('spinbutton', { name: /Tu puntuación/ }), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));
    expect((await screen.findByRole('alert')).textContent).toContain('servicio no está disponible');
    expect(screen.getByDisplayValue('7')).toBeTruthy();

    ratingApi.putRating.mockRejectedValueOnce(new ApiError(409, 'conflict'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Recargar valoración' }));
    expect(await screen.findByDisplayValue('7.8')).toBeTruthy();
  });

  it.each([
    [400, 'Revisa la puntuación y el texto de la reseña.'],
    [401, 'Tu sesión ha caducado. Vuelve a iniciar sesión.'],
    [404, 'La entrada ya no está disponible en tu biblioteca.'],
    [0, 'No se pudo conectar con el servidor. Comprueba tu conexión.'],
    [503, 'El servicio no está disponible ahora. Inténtalo de nuevo más tarde.'],
  ])('handles HTTP %i with a safe message', async (status, message) => {
    const onUnauthorized = vi.fn();
    ratingApi.putRating.mockRejectedValueOnce(new ApiError(status, 'internal detail'));
    renderDialog(vi.fn(), onUnauthorized);
    await screen.findByRole('button', { name: 'Guardar valoración' });
    fireEvent.change(screen.getByRole('spinbutton', { name: /Tu puntuación/ }), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));
    expect((await screen.findByRole('alert')).textContent).toContain(message);
    expect(screen.queryByText('internal detail')).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });

  it('does not persist private rating data in browser storage', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderDialog();
    await screen.findByRole('button', { name: 'Guardar valoración' });
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('does not silently drop a score the browser could not parse', async () => {
    renderDialog();
    await screen.findByRole('button', { name: 'Guardar valoración' });
    const scoreInput = screen.getByRole('spinbutton', { name: /Tu puntuación/ });
    Object.defineProperty(scoreInput, 'validity', {
      configurable: true,
      value: { badInput: true },
    });
    fireEvent.change(scoreInput, { target: { value: '8' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Reseña/ }), {
      target: { value: 'Buena' },
    });
    // jsdom reports the unparsable value as an empty string, as browsers do.
    fireEvent.change(scoreInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));

    expect((await screen.findByRole('alert')).textContent).toContain('La puntuación debe estar');
    expect(ratingApi.putRating).not.toHaveBeenCalled();
  });

  it('accepts exactly 2,000 code points even with surrounding whitespace', async () => {
    renderDialog();
    await screen.findByRole('button', { name: 'Guardar valoración' });
    const review = `\r\n  ${'😀'.repeat(2_000)}  \r\n`;
    fireEvent.change(screen.getByRole('textbox', { name: /Reseña/ }), {
      target: { value: review },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));

    await waitFor(() =>
      expect(ratingApi.putRating).toHaveBeenCalledWith('entry-1', {
        score: null,
        review: '😀'.repeat(2_000),
        containsSpoilers: false,
      }),
    );
  });

  it('shows a specific message on HTTP 429 and keeps the typed text', async () => {
    ratingApi.putRating.mockRejectedValueOnce(new ApiError(429, 'Too many requests'));
    renderDialog();
    await screen.findByRole('button', { name: 'Guardar valoración' });
    fireEvent.change(screen.getByRole('textbox', { name: /Reseña/ }), {
      target: { value: 'Texto que no debe perderse' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar valoración' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Demasiadas solicitudes');
    expect((screen.getByRole('textbox', { name: /Reseña/ }) as HTMLTextAreaElement).value).toBe(
      'Texto que no debe perderse',
    );
  });
});
