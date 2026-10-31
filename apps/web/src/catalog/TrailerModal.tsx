import { useEffect, useRef, useState } from 'react';
import type { MediaVideo } from '@garquinsfilm/shared';

export function TrailerModal({ video, title }: { video: MediaVideo | null; title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousFocus = document.activeElement;
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), iframe'),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function keepFocusInside(event: FocusEvent) {
      if (
        event.target instanceof Node &&
        dialogRef.current &&
        !dialogRef.current.contains(event.target)
      ) {
        closeRef.current?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', keepFocusInside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', keepFocusInside);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [isOpen]);

  if (!video) {
    return (
      <p className="text-sm text-slate-400" role="status">
        No hay tráiler disponible para este título.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 motion-reduce:transition-none"
      >
        <span aria-hidden="true">▶</span>
        Ver tráiler
      </button>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-3 motion-safe:transition-opacity sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="trailer-dialog-title"
            className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-700 px-4 py-3 sm:px-6">
              <h2 id="trailer-dialog-title" className="truncate font-semibold text-slate-50">
                Tráiler: {title}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={`Cerrar tráiler de ${title}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 motion-reduce:transition-none"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="aspect-video bg-black">
              <iframe
                title={`Tráiler de ${title}`}
                src={video.embedUrl}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
