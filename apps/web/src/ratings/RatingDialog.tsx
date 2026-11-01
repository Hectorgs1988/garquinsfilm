import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { RatingPutInput, RatingView } from '@garquinsfilm/shared';

import { ApiError } from '../api.js';
import { deleteRating, getRating, putRating } from './ratings.api.js';
import {
  isValidRatingReview,
  normalizeRatingReview,
  parseRatingScore,
  ratingReviewLength,
} from './rating.validation.js';

interface RatingDialogProps {
  entryId: string;
  title: string;
  initialRating?: RatingView | null;
  onClose: () => void;
  onUnauthorized: () => void;
  onRatingChange: (rating: RatingView | null) => void;
}

function errorMessage(error: unknown, action: 'load' | 'save' | 'delete'): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
    if (error.status === 404) return 'La entrada ya no está disponible en tu biblioteca.';
    if (error.status === 409)
      return 'La valoración cambió en otra operación. Recárgala antes de continuar.';
    if (error.status === 503)
      return 'El servicio no está disponible ahora. Inténtalo de nuevo más tarde.';
    if (error.status === 0) return 'No se pudo conectar con el servidor. Comprueba tu conexión.';
    if (error.status === 400) return 'Revisa la puntuación y el texto de la reseña.';
    if (error.status === 429)
      return 'Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.';
  }
  return action === 'load'
    ? 'No se pudo cargar tu valoración. Inténtalo de nuevo.'
    : 'No se pudo guardar el cambio. Inténtalo de nuevo.';
}

export function RatingDialog({
  entryId,
  title,
  initialRating,
  onClose,
  onUnauthorized,
  onRatingChange,
}: RatingDialogProps) {
  const [rating, setRating] = useState<RatingView | null>(initialRating ?? null);
  const [score, setScore] = useState(
    initialRating?.score === null || initialRating?.score === undefined
      ? ''
      : String(initialRating.score),
  );
  const [review, setReview] = useState(initialRating?.review ?? '');
  const [containsSpoilers, setContainsSpoilers] = useState(
    initialRating?.containsSpoilers ?? false,
  );
  const [loading, setLoading] = useState(initialRating === undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [scoreBadInput, setScoreBadInput] = useState(false);
  const pendingRef = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const discardFocusRef = useRef<HTMLButtonElement>(null);
  const deleteFocusRef = useRef<HTMLButtonElement>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  const initialValueRef = useRef(
    `${initialRating?.score === null || initialRating?.score === undefined ? '' : String(initialRating.score)}\u0000${initialRating?.review ?? ''}\u0000${initialRating?.containsSpoilers ?? false}`,
  );
  const dirty =
    !loading &&
    (scoreBadInput ||
      `${score}\u0000${review}\u0000${containsSpoilers}` !== initialValueRef.current);
  const normalized = normalizeRatingReview(review);
  const reviewLength = ratingReviewLength(normalized ?? '');

  function setFormValue(value: RatingView | null) {
    setRating(value);
    setScore(value?.score === null || value?.score === undefined ? '' : String(value.score));
    setReview(value?.review ?? '');
    setContainsSpoilers(value?.containsSpoilers ?? false);
    setScoreBadInput(false);
    const initial = `${value?.score === null || value?.score === undefined ? '' : String(value.score)}\u0000${value?.review ?? ''}\u0000${value?.containsSpoilers ?? false}`;
    initialValueRef.current = initial;
    onRatingChange(value);
  }

  async function loadRating() {
    setLoading(true);
    setLoadFailed(false);
    setError('');
    try {
      setFormValue(await getRating(entryId));
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) onUnauthorized();
      setLoadFailed(true);
      setError(errorMessage(loadError, 'load'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    initialFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    if (initialRating === undefined) void loadRating();
    return () => initialFocusRef.current?.focus();
    // The dialog represents one entry and is remounted when that entry changes.
  }, [entryId]);

  useEffect(() => {
    if (confirmDiscard) discardFocusRef.current?.focus();
    else if (confirmDelete) deleteFocusRef.current?.focus();
  }, [confirmDelete, confirmDiscard]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (confirmDiscard) {
        setConfirmDiscard(false);
      } else if (confirmDelete) {
        setConfirmDelete(false);
      } else {
        requestClose();
      }
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)',
      ),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function handleConfirmationKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (confirmDiscard) setConfirmDiscard(false);
      if (confirmDelete) setConfirmDelete(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)'),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
    event.stopPropagation();
  }

  function requestClose() {
    if (busy) return;
    if (dirty) {
      setConfirmDiscard(true);
      setConfirmDelete(false);
    } else {
      onClose();
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    setError('');
    setNotice('');
    setValidationError('');
    const parsedScore = scoreBadInput ? undefined : parseRatingScore(score);
    if (parsedScore === undefined) {
      setValidationError('La puntuación debe estar entre 0 y 10, en pasos de 0,1.');
      return;
    }
    if (!isValidRatingReview(review)) {
      setValidationError('La reseña contiene caracteres no válidos.');
      return;
    }
    if (reviewLength > 2_000) {
      setValidationError('La reseña no puede superar los 2.000 caracteres.');
      return;
    }
    if (parsedScore === null && normalized === null) {
      setValidationError('Añade una puntuación o una reseña para guardar.');
      return;
    }
    if (containsSpoilers && normalized === null) {
      setValidationError('Marca spoilers solo cuando haya una reseña.');
      return;
    }
    const input: RatingPutInput = {
      score: parsedScore,
      review: normalized,
      containsSpoilers: containsSpoilers && normalized !== null,
    };
    pendingRef.current = true;
    setBusy(true);
    try {
      const updated = await putRating(entryId, input);
      setFormValue(updated);
      setNotice('Tu valoración se guardó correctamente.');
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) onUnauthorized();
      setError(errorMessage(saveError, 'save'));
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await deleteRating(entryId);
      setFormValue(null);
      setNotice('Tu valoración se eliminó correctamente.');
      setConfirmDelete(false);
    } catch (deleteError) {
      if (deleteError instanceof ApiError && deleteError.status === 401) onUnauthorized();
      setError(errorMessage(deleteError, 'delete'));
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }

  function reload() {
    setConfirmDiscard(false);
    void loadRating();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        id="rating-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rating-dialog-title"
        onKeyDown={handleDialogKeyDown}
        className="my-auto w-full max-w-xl rounded-2xl border border-slate-600 bg-slate-900 p-4 shadow-2xl shadow-black/60 sm:p-6"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-wider text-red-300 uppercase">Mi espacio</p>
            <h2 id="rating-dialog-title" className="mt-1 text-xl font-bold text-slate-50">
              Mi valoración: {title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            aria-label="Cerrar editor de valoración"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-slate-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {loading ? (
          <p role="status" className="py-8 text-sm text-slate-300">
            Cargando valoración…
          </p>
        ) : loadFailed ? (
          <div className="mt-5 space-y-3">
            <p role="alert" className="text-sm text-red-200">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void loadRating()}
              className="min-h-11 rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <form noValidate onSubmit={(event) => void save(event)} className="mt-5 space-y-4">
            {error && (
              <div
                role="alert"
                className="space-y-2 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-200"
              >
                <p>{error}</p>
                {error.includes('cambió') && (
                  <button
                    type="button"
                    onClick={reload}
                    className="min-h-11 rounded-lg border border-red-700 px-3 font-semibold text-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
                  >
                    Recargar valoración
                  </button>
                )}
              </div>
            )}
            {notice && (
              <p role="status" className="text-sm text-emerald-300">
                {notice}
              </p>
            )}
            <label
              className="grid gap-1.5 text-sm font-medium text-slate-200"
              htmlFor="rating-score"
            >
              Tu puntuación
              <input
                id="rating-score"
                name="score"
                type="number"
                lang="es-ES"
                inputMode="decimal"
                min={0}
                max={10}
                step={0.1}
                value={score}
                onChange={(event) => {
                  setScore(event.target.value);
                  setScoreBadInput(event.target.validity.badInput);
                }}
                disabled={busy}
                placeholder="Sin puntuación"
                className="min-h-12 rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-slate-50 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:opacity-60"
              />
              <span className="text-xs font-normal text-slate-400">De 0,0 a 10,0</span>
            </label>
            <label
              className="grid gap-1.5 text-sm font-medium text-slate-200"
              htmlFor="rating-review"
            >
              Reseña (opcional)
              <textarea
                id="rating-review"
                name="review"
                rows={5}
                value={review}
                onChange={(event) => setReview(event.target.value)}
                disabled={busy}
                className="min-h-32 resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-base leading-relaxed text-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:opacity-60"
              />
              <span
                className="text-xs font-normal text-slate-400"
                aria-live="polite"
                aria-label={`Reseña: ${reviewLength} de 2000 caracteres`}
              >
                {reviewLength.toLocaleString('es-ES')} / 2.000 caracteres
              </span>
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={containsSpoilers}
                disabled={busy || normalized === null}
                onChange={(event) => setContainsSpoilers(event.target.checked)}
                className="h-5 w-5 accent-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
              />
              Esta reseña contiene spoilers
            </label>
            {validationError && (
              <p role="alert" className="text-sm text-red-200">
                {validationError}
              </p>
            )}
            <div className="flex flex-col-reverse justify-between gap-3 border-t border-slate-700 pt-4 sm:flex-row">
              <div>
                {rating && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                    className="min-h-11 rounded-lg border border-red-900/70 px-4 text-sm font-semibold text-red-200 hover:border-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:opacity-60"
                  >
                    Eliminar valoración
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={busy || loading}
                aria-busy={busy}
                className="min-h-11 rounded-lg bg-red-800 px-5 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? 'Guardando…' : rating ? 'Guardar cambios' : 'Guardar valoración'}
              </button>
            </div>
          </form>
        )}

        {confirmDiscard && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4">
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="discard-rating-title"
              onKeyDown={handleConfirmationKeyDown}
              className="w-full max-w-sm rounded-2xl border border-slate-600 bg-slate-900 p-5 shadow-2xl"
            >
              <h3 id="discard-rating-title" className="font-semibold text-slate-50">
                ¿Descartar los cambios?
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Se perderá el texto que aún no has guardado.
              </p>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  ref={discardFocusRef}
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="min-h-11 rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
                >
                  Seguir editando
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 rounded-lg bg-red-800 px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
                >
                  Descartar
                </button>
              </div>
            </section>
          </div>
        )}
        {confirmDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4">
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-rating-title"
              onKeyDown={handleConfirmationKeyDown}
              className="w-full max-w-sm rounded-2xl border border-slate-600 bg-slate-900 p-5 shadow-2xl"
            >
              <h3 id="delete-rating-title" className="font-semibold text-slate-50">
                ¿Eliminar tu valoración?
              </h3>
              <p className="mt-2 text-sm text-slate-300">La entrada seguirá en tu biblioteca.</p>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  ref={deleteFocusRef}
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy}
                  className="min-h-11 rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={busy}
                  className="min-h-11 rounded-lg bg-red-800 px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:opacity-60"
                >
                  {busy ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
