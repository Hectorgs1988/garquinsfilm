import type { LibraryEntryView, LibraryEntryStatus, RatingView } from '@garquinsfilm/shared';
import { SpoilerReview } from '../ratings/SpoilerReview.js';

const STATUS_LABELS: Record<LibraryEntryStatus, string> = {
  PENDING: 'Pendiente',
  WATCHING: 'Viendo',
  COMPLETED: 'Completado',
  ABANDONED: 'Abandonado',
};

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : dateFormatter.format(date);
}

interface LibraryEntryCardProps {
  entry: LibraryEntryView;
  view: 'grid' | 'list';
  busy: boolean;
  onStatusChange: (entry: LibraryEntryView, status: LibraryEntryStatus) => void;
  onToggleFavorite: (entry: LibraryEntryView) => void;
  onRequestDelete: (entry: LibraryEntryView, trigger: HTMLButtonElement) => void;
  rating?: RatingView | null;
  ratingLoading?: boolean;
  ratingError?: string;
  onManageRating: (entry: LibraryEntryView) => void;
  onManageSeasons?: (entry: LibraryEntryView) => void;
}

export function LibraryEntryCard({
  entry,
  view,
  busy,
  onStatusChange,
  onToggleFavorite,
  onRequestDelete,
  rating,
  ratingLoading = false,
  ratingError = '',
  onManageRating,
  onManageSeasons,
}: LibraryEntryCardProps) {
  const title = entry.media?.title || 'Título no disponible';
  const typeLabel = entry.type === 'movie' ? 'Película' : 'Serie';
  const ratingActionLabel = ratingLoading
    ? 'Cargando valoración…'
    : rating === null
      ? 'Puntuar y reseñar'
      : rating?.score !== null && rating?.score !== undefined
        ? `Mi valoración · ${rating.score.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/10`
        : rating?.review
          ? 'Mi valoración · Reseña'
          : 'Mi valoración';

  return (
    <article
      className={`min-w-0 rounded-2xl border border-slate-700 bg-slate-800/80 p-4 shadow-lg shadow-black/10 ${
        view === 'list' ? 'sm:flex sm:items-center sm:gap-5' : 'space-y-4'
      }`}
      aria-label={`${title}, ${typeLabel}`}
    >
      <div className={`min-w-0 ${view === 'list' ? 'sm:flex-1' : 'space-y-3'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-50" title={title}>
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {typeLabel} · TMDB ID {entry.tmdbId}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-600 bg-slate-900/70 text-lg text-amber-300 transition-colors hover:border-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 motion-reduce:transition-none"
            aria-label={
              entry.isFavorite ? `Quitar ${title} de favoritos` : `Añadir ${title} a favoritos`
            }
            aria-pressed={entry.isFavorite}
            disabled={busy}
            onClick={() => onToggleFavorite(entry)}
          >
            <span aria-hidden="true">{entry.isFavorite ? '★' : '☆'}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>
            Añadido <time dateTime={entry.addedAt}>{formatDate(entry.addedAt)}</time>
          </span>
          <span className="font-medium text-slate-300">{STATUS_LABELS[entry.status]}</span>
        </div>
      </div>

      <div
        className={`grid gap-3 ${view === 'list' ? 'mt-4 sm:mt-0 sm:w-64 sm:grid-cols-2' : 'grid-cols-2'}`}
      >
        <div className="col-span-2">
          <button
            type="button"
            className="min-h-11 w-full cursor-pointer rounded-lg border border-amber-700/60 bg-amber-950/20 px-3 text-sm font-semibold text-amber-100 transition-colors hover:border-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
            onClick={() => onManageRating(entry)}
            aria-label={`${ratingActionLabel} de ${title}`}
            aria-busy={ratingLoading || undefined}
            disabled={ratingLoading}
          >
            {ratingActionLabel}
          </button>
          {entry.type === 'tv' && onManageSeasons && (
            <button
              type="button"
              className="mt-3 min-h-11 w-full cursor-pointer rounded-lg border border-slate-600 bg-slate-900/70 px-3 text-sm font-semibold text-slate-100 transition-colors hover:border-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 motion-reduce:transition-none"
              onClick={() => onManageSeasons(entry)}
              aria-label={`Mis temporadas de ${title}`}
            >
              Mis temporadas
            </button>
          )}
          {ratingError && (
            <p role="alert" className="mt-1 text-xs text-red-200">
              {ratingError}
            </p>
          )}
          {rating?.review && (
            <div className="mt-2 space-y-2 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
              <p className="text-xs font-semibold text-slate-300">Tu reseña</p>
              <SpoilerReview
                key={`${rating.updatedAt}-${rating.review}`}
                review={rating.review}
                containsSpoilers={rating.containsSpoilers}
              />
            </div>
          )}
        </div>
        <label className="col-span-2 grid gap-1.5 text-xs font-medium text-slate-300 sm:col-span-2">
          Estado
          <select
            aria-label={`Estado de ${title}`}
            value={entry.status}
            disabled={busy}
            onChange={(event) => onStatusChange(entry, event.target.value as LibraryEntryStatus)}
            className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-wait disabled:opacity-60"
          >
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="min-h-11 cursor-pointer rounded-lg border border-red-900/70 bg-red-950/30 px-3 text-sm font-semibold text-red-200 transition-colors hover:border-red-500 hover:bg-red-950/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
          disabled={busy}
          onClick={(event) => onRequestDelete(entry, event.currentTarget)}
        >
          Eliminar
        </button>
      </div>
    </article>
  );
}
