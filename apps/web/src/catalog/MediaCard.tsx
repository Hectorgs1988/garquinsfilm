import type { MediaSummary } from '@garquinsfilm/shared';

interface MediaCardProps {
  media: MediaSummary;
  onSelect: (media: MediaSummary) => void;
}

export function MediaCard({ media, onSelect }: MediaCardProps) {
  const rating =
    media.voteAverage !== null && Number.isFinite(media.voteAverage)
      ? media.voteAverage.toFixed(1)
      : null;

  const mediaLabel = media.type === 'movie' ? 'Película' : 'Serie';

  return (
    <article className="group min-w-0">
      <button
        type="button"
        onClick={() => onSelect(media)}
        aria-label={`Ver detalles de ${media.title}`}
        className="block h-full w-full cursor-pointer rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-400"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-slate-700 bg-slate-800 transition-all duration-200 group-hover:-translate-y-1 group-hover:border-red-700 group-hover:shadow-xl group-hover:shadow-red-950/20 motion-reduce:transform-none motion-reduce:transition-none">
          {media.posterUrl ? (
            <img
              src={media.posterUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-3 px-3 text-center text-slate-400"
              aria-hidden="true"
            >
              <span className="text-4xl text-red-400">✦</span>
              <span className="text-xs font-medium">Sin póster</span>
            </div>
          )}

          {rating !== null && (
            <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950/90 px-2 py-1 text-xs font-bold text-amber-400 shadow-sm backdrop-blur-sm">
              <span aria-hidden="true">★</span>
              <span>{rating}</span>
            </span>
          )}
        </div>

        <div className="px-0.5 pt-3 pb-1">
          <h3
            className="truncate text-sm leading-snug font-semibold text-slate-50 transition-colors group-hover:text-red-300 motion-reduce:transition-none"
            title={media.title}
          >
            {media.title}
          </h3>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            <span>{media.year ?? 'Año desconocido'}</span>

            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>

            <span>{mediaLabel}</span>
          </div>
        </div>
      </button>
    </article>
  );
}
