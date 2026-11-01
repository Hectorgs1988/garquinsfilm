import { useState } from 'react';
import type { MediaSummary } from '@garquinsfilm/shared';

import { MediaCard } from './MediaCard.js';
import { MediaDetailPage } from './MediaDetailPage.js';
import { DEMO_MEDIA, getDemoMediaDetail } from './catalog.mock.js';

type CatalogFilter = 'all' | 'movie' | 'tv';

export function CatalogPage({ onUnauthorized }: { onUnauthorized?: () => void } = {}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CatalogFilter>('all');
  const [selectedMedia, setSelectedMedia] = useState<MediaSummary | null>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase('es');

  const filteredMedia = DEMO_MEDIA.filter((media) => {
    const matchesType = filter === 'all' || media.type === filter;

    const matchesQuery = media.title.toLocaleLowerCase('es').includes(normalizedQuery);

    return matchesType && matchesQuery;
  });

  // Mostrar la ficha de la película o serie seleccionada.
  // Los estados de búsqueda y filtros se conservan al regresar.
  if (selectedMedia) {
    return (
      <MediaDetailPage
        media={getDemoMediaDetail(selectedMedia) ?? selectedMedia}
        onBack={() => setSelectedMedia(null)}
        isDemo
        onUnauthorized={onUnauthorized}
      />
    );
  }

  return (
    <section aria-labelledby="catalog-title" className="space-y-7">
      {/* Cabecera */}
      <div className="space-y-2">
        <span className="text-xs font-bold tracking-[0.16em] text-red-300 uppercase">Explorar</span>

        <h1
          id="catalog-title"
          className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl"
        >
          Descubre tu próxima historia.
        </h1>

        <p className="max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
          Explora películas y series en un mismo lugar.
        </p>
      </div>

      {/* Búsqueda instantánea */}
      <div role="search">
        <label htmlFor="catalog-search" className="sr-only">
          Buscar películas o series
        </label>

        <input
          id="catalog-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Busca una película o serie..."
          maxLength={100}
          autoComplete="off"
          className="min-h-12 w-full rounded-xl border border-slate-600 bg-slate-800 px-4 text-base text-slate-50 placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/20"
        />
      </div>

      {/* Filtros por tipo */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
        {(
          [
            ['all', 'Todo'],
            ['movie', 'Películas'],
            ['tv', 'Series'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-10 cursor-pointer rounded-full border px-4 text-sm font-semibold transition-colors ${
              filter === value
                ? 'border-red-700 bg-red-700 text-white'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Encabezado de resultados */}
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-50">
          {normalizedQuery ? `Resultados para «${query.trim()}»` : 'Para explorar'}
        </h2>

        <span className="text-xs text-slate-400" aria-live="polite" aria-atomic="true">
          {filteredMedia.length} resultados de demostración
        </span>
      </div>

      {/* Tarjetas o estado vacío */}
      {filteredMedia.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredMedia.map((media) => (
            <MediaCard
              key={`${media.type}-${media.tmdbId}`}
              media={media}
              onSelect={setSelectedMedia}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 px-6 py-12 text-center">
          <h3 className="text-lg font-semibold text-slate-50">No encontramos resultados</h3>

          <p className="mt-2 text-sm text-slate-400">Prueba con otro título o cambia el filtro.</p>
        </div>
      )}

      {/* Aviso del entorno de demostración */}
      <p className="text-xs text-slate-500">
        Catálogo de demostración con datos ficticios. La búsqueda real estará disponible cuando se
        autorice la integración con TMDB.
      </p>
    </section>
  );
}
