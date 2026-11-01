import { useEffect, useRef, type KeyboardEvent } from 'react';

import { SeasonProgressPanel } from './SeasonProgressPanel.js';

interface SeasonProgressDialogProps {
  entryId: string;
  title: string;
  onClose: () => void;
  onUnauthorized: () => void;
}

/**
 * Diálogo de «Mis temporadas» para la biblioteca. Solo consulta el progreso guardado:
 * no pide metadatos de catálogo porque `/api/media/tv/:tmdbId` puede llegar a TMDB
 * (TMDB-TERMS-001 pendiente). Las tarjetas nunca consultan temporadas individualmente.
 */
export function SeasonProgressDialog({
  entryId,
  title,
  onClose,
  onUnauthorized,
}: SeasonProgressDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const unauthorizedRef = useRef(onUnauthorized);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    unauthorizedRef.current = onUnauthorized;
    onCloseRef.current = onClose;
  }, [onUnauthorized, onClose]);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  // Escape también debe cerrar cuando el foco se pierde al deshabilitarse un botón.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
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
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="season-dialog-title"
        onKeyDown={handleKeyDown}
        className="my-auto w-full max-w-2xl min-w-0 rounded-2xl border border-slate-600 bg-slate-900 p-4 shadow-2xl shadow-black/60 sm:p-6"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wider text-red-300 uppercase">Mi espacio</p>
            <h2
              id="season-dialog-title"
              className="mt-1 text-xl font-bold break-words text-slate-50"
            >
              Mis temporadas: {title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar temporadas"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-2xl text-slate-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="mt-5 space-y-4">
          <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <p className="text-sm text-slate-300">
              La carga de metadatos de temporadas está pendiente de habilitación. Mientras tanto
              puedes consultar, marcar y desmarcar tus temporadas vistas; el porcentaje está
              disponible en la ficha de la serie.
            </p>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="min-h-11 cursor-not-allowed rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-100 opacity-50"
            >
              Cargar temporadas del catálogo
            </button>
          </div>
          <SeasonProgressPanel entryId={entryId} seasons={null} onUnauthorized={onUnauthorized} />
        </div>
      </section>
    </div>
  );
}
