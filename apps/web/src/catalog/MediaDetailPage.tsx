import { useState } from 'react';
import type { MediaDetail, MediaSummary, MediaWatchProvider, TvSeason } from '@garquinsfilm/shared';

import { MediaCredits } from './MediaCredits.js';
import { TrailerModal } from './TrailerModal.js';

interface MediaDetailPageProps {
  media: MediaSummary | MediaDetail;
  onBack: () => void;
  isDemo?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const numberFormatter = new Intl.NumberFormat('es-ES');

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date);
}

function formatRuntime(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return null;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  return remainingMinutes === 0 ? `${hours} h` : `${hours} h ${remainingMinutes} min`;
}

function translateStatus(status: string): string {
  const translations: Record<string, string> = {
    Released: 'Estrenada',
    'Returning Series': 'En emisión',
    Ended: 'Finalizada',
    Canceled: 'Cancelada',
    Planned: 'Planificada',
    'In Production': 'En producción',
    'Post Production': 'En posproducción',
    Rumored: 'Anunciada',
  };
  return translations[status] ?? status;
}

function isMediaDetail(media: MediaSummary | MediaDetail): media is MediaDetail {
  return 'cast' in media;
}

export function MediaDetailPage({ media, onBack, isDemo = false }: MediaDetailPageProps) {
  const detail = isMediaDetail(media) ? media : null;
  const isMovie = media.type === 'movie';
  const releaseDate =
    detail?.type === 'movie'
      ? formatDate(detail.releaseDate)
      : detail?.type === 'tv'
        ? formatDate(detail.firstAirDate)
        : null;
  const rating =
    media.voteAverage !== null && Number.isFinite(media.voteAverage)
      ? media.voteAverage.toFixed(1)
      : null;
  const runtime = detail?.type === 'movie' ? formatRuntime(detail.runtime) : null;
  const overview =
    media.overview?.trim() || 'Todavía no tenemos una sinopsis disponible para este título.';
  const titleId = 'media-detail-title';

  return (
    <section aria-labelledby={titleId} className="min-w-0 space-y-6 sm:space-y-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-300 transition-colors hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 motion-reduce:transition-none"
      >
        <span aria-hidden="true" className="text-xl">
          ←
        </span>
        Volver a explorar
      </button>

      <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-800">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_10%,rgba(185,28,28,0.24),transparent_65%)]"
        />
        <div className="relative grid grid-cols-[minmax(0,1fr)_6.5rem] items-start gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_9rem] sm:gap-6 sm:p-6 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-center md:gap-8 md:p-8 lg:gap-10 lg:p-10">
          <div className="order-2 col-start-2 w-full md:order-1 md:col-start-auto">
            <div className="aspect-[2/3] overflow-hidden rounded-xl border border-slate-600 bg-slate-900 shadow-2xl shadow-black/30">
              {media.posterUrl ? (
                <img
                  src={media.posterUrl}
                  alt={`Póster de ${media.title}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                  <span aria-hidden="true" className="text-4xl text-red-400">
                    ✦
                  </span>
                  <span className="text-xs">Sin póster</span>
                </div>
              )}
            </div>
          </div>

          <div className="order-1 col-span-2 min-w-0 space-y-4 sm:space-y-5 md:order-2 md:col-span-1">
            <div className="space-y-2">
              <span className="text-xs font-bold tracking-[0.16em] text-red-300 uppercase">
                {isMovie ? 'Película' : 'Serie de televisión'}
              </span>
              <h1
                id={titleId}
                className="text-2xl leading-tight font-bold tracking-tight text-slate-50 sm:text-3xl lg:text-5xl"
              >
                {media.title}
              </h1>
              {media.originalTitle !== media.title && (
                <p className="text-sm text-slate-400">Título original: {media.originalTitle}</p>
              )}
              {detail?.type === 'movie' && detail.tagline && (
                <p className="pt-1 text-sm text-red-200 italic sm:text-base">“{detail.tagline}”</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300 sm:gap-3">
              {(releaseDate ?? (media.year !== null ? String(media.year) : null)) && (
                <span>{releaseDate ?? media.year}</span>
              )}
              {runtime && (
                <>
                  <span aria-hidden="true" className="text-slate-500">
                    ·
                  </span>
                  <span>{runtime}</span>
                </>
              )}
              {detail?.type === 'tv' && detail.numberOfSeasons !== null && (
                <span>
                  {detail.numberOfSeasons}{' '}
                  {detail.numberOfSeasons === 1 ? 'temporada' : 'temporadas'}
                </span>
              )}
              {detail?.type === 'tv' && detail.numberOfEpisodes !== null && (
                <>
                  <span aria-hidden="true" className="text-slate-500">
                    ·
                  </span>
                  <span>{detail.numberOfEpisodes} episodios</span>
                </>
              )}
              {rating !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/10 px-2.5 py-1.5 font-semibold text-amber-300">
                  <span aria-hidden="true">★</span>
                  {rating}
                  <span className="font-normal text-slate-400">/ 10</span>
                </span>
              )}
              {media.voteCount !== null && (
                <span className="text-xs text-slate-400">
                  {numberFormatter.format(media.voteCount)} votos
                </span>
              )}
            </div>

            {detail?.genres.length ? (
              <ul aria-label="Géneros" className="flex flex-wrap gap-2">
                {detail.genres.map((genre) => (
                  <li
                    key={genre.id}
                    className="rounded-full border border-slate-600 bg-slate-900/50 px-3 py-1 text-xs font-medium text-slate-200"
                  >
                    {genre.name}
                  </li>
                ))}
              </ul>
            ) : null}

            {detail?.status && (
              <p className="text-sm text-slate-300">
                <span className="text-slate-400">Estado: </span>
                {translateStatus(detail.status)}
              </p>
            )}

            <div className="space-y-2">
              <h2 className="text-base font-semibold text-slate-50 sm:text-lg">Sinopsis</h2>
              <p className="max-w-2xl text-sm leading-7 whitespace-pre-line text-slate-300 sm:text-base">
                {overview}
              </p>
            </div>

            <TrailerModal video={detail?.trailer ?? null} title={media.title} />
          </div>
        </div>
      </div>

      {detail ? (
        <>
          <MediaCredits
            cast={detail.cast}
            crew={detail.type === 'movie' ? detail.directors : detail.creators}
            crewTitle={detail.type === 'movie' ? 'Dirección' : 'Creación'}
          />
          {detail.type === 'tv' && <SeasonList seasons={detail.seasons} />}
          <WatchProviders providers={detail.watchProviders} isDemo={isDemo} />
        </>
      ) : (
        <section className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
          <h2 className="text-lg font-semibold text-slate-50">Ficha ampliada</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Aún no hay información ampliada para este título.
          </p>
        </section>
      )}
    </section>
  );
}

function SeasonList({ seasons }: { seasons: TvSeason[] }) {
  if (seasons.length === 0) {
    return (
      <section aria-labelledby="seasons-title" className="space-y-4">
        <h2 id="seasons-title" className="text-xl font-bold text-slate-50">
          Temporadas
        </h2>
        <p className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 text-sm text-slate-400">
          No hay temporadas disponibles.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="seasons-title" className="space-y-4">
      <h2 id="seasons-title" className="text-xl font-bold text-slate-50">
        Temporadas
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {seasons.map((season) => (
          <SeasonCard key={season.seasonNumber} season={season} />
        ))}
      </ul>
    </section>
  );
}

function SeasonCard({ season }: { season: TvSeason }) {
  const isSpecial = season.isSpecial || season.seasonNumber === 0;
  const airDate = formatDate(season.airDate);
  return (
    <li className="flex min-w-0 gap-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <div className="h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-900">
        {season.posterUrl ? (
          <img
            src={season.posterUrl}
            alt={`Póster de ${season.name}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full items-center justify-center text-2xl text-red-400"
            aria-hidden="true"
          >
            ✦
          </div>
        )}
      </div>
      <div className="min-w-0 self-center">
        <h3 className="font-semibold text-slate-50">
          {isSpecial ? 'Especiales' : `Temporada ${season.seasonNumber}`}
        </h3>
        {!isSpecial && season.name !== `Temporada ${season.seasonNumber}` && (
          <p className="mt-1 text-sm text-slate-300">{season.name}</p>
        )}
        <p className="mt-1 text-sm text-slate-300">
          {season.episodeCount} {season.episodeCount === 1 ? 'episodio' : 'episodios'}
        </p>
        {airDate && <p className="mt-1 text-xs text-slate-400">{airDate}</p>}
        {isSpecial && season.name !== 'Especiales' && (
          <p className="mt-1 text-xs text-slate-400">{season.name}</p>
        )}
      </div>
    </li>
  );
}

function WatchProviders({
  providers,
  isDemo,
}: {
  providers: MediaDetail['watchProviders'];
  isDemo: boolean;
}) {
  const groups: {
    key: 'subscription' | 'rent' | 'buy';
    title: string;
    items: MediaWatchProvider[];
  }[] = [
    { key: 'subscription', title: 'Suscripción', items: providers.subscription },
    { key: 'rent', title: 'Alquiler', items: providers.rent },
    { key: 'buy', title: 'Compra', items: providers.buy },
  ];
  const hasProviders = groups.some((group) => group.items.length > 0);

  return (
    <section aria-labelledby="watch-providers-title" className="space-y-4">
      <div>
        <h2 id="watch-providers-title" className="text-xl font-bold text-slate-50">
          Dónde ver en España
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          {isDemo
            ? 'Disponibilidad ficticia de demostración; no representa servicios ni disponibilidad reales.'
            : 'Disponibilidad comunicada para España.'}
        </p>
      </div>
      {!hasProviders && (
        <p className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 text-sm text-slate-400">
          No hay disponibilidad de streaming para mostrar.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {groups.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`provider-${group.key}`}
            className="rounded-xl border border-slate-700 bg-slate-800/60 p-4"
          >
            <h3 id={`provider-${group.key}`} className="text-sm font-semibold text-slate-200">
              {group.title}
            </h3>
            {group.items.length ? (
              <ul className="mt-3 flex flex-wrap gap-3">
                {group.items.map((provider) => (
                  <ProviderBadge key={provider.tmdbId} provider={provider} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Sin opciones disponibles</p>
            )}
          </section>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Atribución: {providers.attribution}
        {providers.link && (
          <>
            {' · '}
            <a
              href={providers.link}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-red-300 underline decoration-red-300/50 underline-offset-2 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
            >
              Ver disponibilidad en {providers.attribution}
            </a>
          </>
        )}
      </p>
    </section>
  );
}

function ProviderBadge({ provider }: { provider: MediaWatchProvider }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <li className="flex min-w-16 flex-col items-center gap-1.5 text-center">
      {provider.logoUrl && !imageFailed ? (
        <img
          src={provider.logoUrl}
          alt={provider.name}
          loading="lazy"
          onError={() => setImageFailed(true)}
          className="h-12 w-12 rounded-xl bg-slate-900 object-contain p-1"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-600 bg-slate-900 text-lg font-bold text-red-300"
        >
          {provider.name.slice(0, 1).toLocaleUpperCase('es')}
        </span>
      )}
      <span className="max-w-24 text-xs text-slate-300">{provider.name}</span>
    </li>
  );
}
