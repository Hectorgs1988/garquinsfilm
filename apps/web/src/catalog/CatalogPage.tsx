import { useEffect, useRef, useState } from 'react';
import type { MediaSearchResponse, MediaSummary } from '@garquinsfilm/shared';

import { ApiError } from '../api.js';
import { MediaCard } from './MediaCard.js';
import { MediaDetailLoader } from './MediaDetailLoader.js';
import { TmdbAttribution } from './TmdbAttribution.js';
import { searchCatalog } from './catalog.api.js';

type CatalogFilter = 'all' | 'movie' | 'tv';

/** Espera a que el usuario deje de escribir para no pedir una búsqueda por tecla. */
const SEARCH_DEBOUNCE_MS = 350;

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
    if (error.status === 400) return 'Esa búsqueda no es válida. Prueba con otro texto.';
    if (error.status === 429) return 'Has buscado muchas veces seguidas. Espera un momento.';
    if (error.status === 503) return 'El catálogo no está disponible ahora. Inténtalo más tarde.';
    if (error.status === 0) return 'No se pudo conectar con el servidor. Comprueba tu conexión.';
  }
  return 'No se pudo completar la búsqueda. Inténtalo de nuevo.';
}

export function CatalogPage({
  onUnauthorized,
  debounceMs = SEARCH_DEBOUNCE_MS,
}: {
  onUnauthorized?: () => void;
  /** Solo se cambia en las pruebas, para no esperar al antirrebote. */
  debounceMs?: number;
} = {}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CatalogFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedMedia, setSelectedMedia] = useState<MediaSummary | null>(null);

  const [result, setResult] = useState<MediaSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  const trimmedQuery = query.trim();
  const requestId = useRef(0);

  useEffect(() => {
    setPage(1);
  }, [trimmedQuery, filter]);

  useEffect(() => {
    if (!trimmedQuery) {
      setResult(null);
      setError('');
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const current = ++requestId.current;
    setLoading(true);

    const timer = window.setTimeout(() => {
      searchCatalog({ query: trimmedQuery, type: filter, page, signal: controller.signal })
        .then((response) => {
          if (current !== requestId.current) return;
          setResult(response);
          setError('');
        })
        .catch((caught: unknown) => {
          if (current !== requestId.current || controller.signal.aborted) return;
          if (caught instanceof ApiError && caught.status === 401) {
            onUnauthorized?.();
            return;
          }
          setResult(null);
          setError(getErrorMessage(caught));
        })
        .finally(() => {
          if (current === requestId.current) setLoading(false);
        });
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery, filter, page, retryKey, debounceMs, onUnauthorized]);

  // Al volver del detalle se conservan la búsqueda, el filtro y la página.
  if (selectedMedia) {
    return (
      <MediaDetailLoader
        key={`${selectedMedia.type}-${selectedMedia.tmdbId}`}
        media={selectedMedia}
        onBack={() => setSelectedMedia(null)}
        onUnauthorized={onUnauthorized}
      />
    );
  }

  const results = result?.results ?? [];
  const totalPages = result?.totalPages ?? 1;

  return (
    <section aria-labelledby="catalog-title" className="space-y-7">
      <div className="space-y-2">
        <span className="text-xs font-bold tracking-[0.16em] text-red-300 uppercase">Explorar</span>
        <h1
          id="catalog-title"
          className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl"
        >
          Descubre tu próxima historia.
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
          Busca entre millones de películas y series.
        </p>
      </div>

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
          className="min-h-12 w-full rounded-xl border border-slate-600 bg-slate-800 px-4 text-base text-slate-50 placeholder:text-slate-400 focus:border-red-400 focus:ring-2 focus:ring-red-500/20 focus:outline-none"
        />
      </div>

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

      {trimmedQuery && (
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-50">Resultados para «{trimmedQuery}»</h2>
          <span className="text-xs text-slate-400" aria-live="polite" aria-atomic="true">
            {loading
              ? 'Buscando…'
              : `${result?.totalResults ?? 0} ${
                  result?.totalResults === 1 ? 'resultado' : 'resultados'
                }`}
          </span>
        </div>
      )}

      {!trimmedQuery ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 px-6 py-12 text-center">
          <h3 className="text-lg font-semibold text-slate-50">Empieza por un título</h3>
          <p className="mt-2 text-sm text-slate-400">
            Escribe el nombre de una película o una serie para buscarla.
          </p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 px-6 py-12 text-center">
          <p role="alert" className="text-sm text-red-200">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setRetryKey((value) => value + 1)}
            className="mt-4 min-h-11 cursor-pointer rounded-lg bg-red-800 px-4 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
          >
            Reintentar
          </button>
        </div>
      ) : loading && results.length === 0 ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-slate-700 bg-slate-800/70 px-6 py-12 text-center text-sm text-slate-300"
        >
          <span className="inline-block animate-pulse motion-reduce:animate-none">Buscando…</span>
        </p>
      ) : results.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {results.map((media) => (
              <MediaCard
                key={`${media.type}-${media.tmdbId}`}
                media={media}
                onSelect={setSelectedMedia}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="min-h-11 cursor-pointer rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-200 hover:border-red-400 disabled:cursor-default disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-sm text-slate-400">
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((value) => value + 1)}
                className="min-h-11 cursor-pointer rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-200 hover:border-red-400 disabled:cursor-default disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 px-6 py-12 text-center">
          <h3 className="text-lg font-semibold text-slate-50">No encontramos resultados</h3>
          <p className="mt-2 text-sm text-slate-400">Prueba con otro título o cambia el filtro.</p>
        </div>
      )}

      <TmdbAttribution />
    </section>
  );
}
