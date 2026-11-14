import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LIBRARY_ENTRY_STATUSES,
  type LibraryEntryStatus,
  type LibraryEntryView,
  type LibraryListQuery,
  type LibraryListResponse,
  type LibrarySortBy,
  type LibrarySortOrder,
  type MediaType,
  type RatingView,
} from '@garquinsfilm/shared';

import { ApiError } from '../api.js';
import { LibraryEntryCard } from './LibraryEntryCard.js';
import { deleteLibraryEntry, listLibrary, updateLibraryEntry } from './library.api.js';
import { RatingDialog } from '../ratings/RatingDialog.js';
import { SeasonProgressDialog } from '../seasons/SeasonProgressDialog.js';
import { getRating } from '../ratings/ratings.api.js';

const PAGE_SIZE = 20;
/** Tiempo que permanece un aviso de éxito antes de retirarse solo. */
export const NOTICE_TIMEOUT_MS = 5000;

type TypeFilter = MediaType | 'all';
type StatusFilter = LibraryEntryStatus | 'all';
type FavoriteFilter = 'all' | 'favorites';

interface Filters {
  type: TypeFilter;
  status: StatusFilter;
  favorite: FavoriteFilter;
  sortBy: LibrarySortBy;
  sortOrder: LibrarySortOrder;
}

function toListQuery(filters: Filters, page: number): LibraryListQuery {
  return {
    ...(filters.type === 'all' ? {} : { type: filters.type }),
    ...(filters.status === 'all' ? {} : { status: filters.status }),
    ...(filters.favorite === 'all' ? {} : { favorite: true }),
    page,
    pageSize: PAGE_SIZE,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  };
}

function getErrorMessage(error: unknown, action: 'load' | 'update' | 'delete'): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
    if (error.status === 403) return 'No tienes permiso para realizar esta acción.';
    if (error.status === 404)
      return 'La entrada ya no está disponible. Se actualizará la biblioteca.';
    if (error.status === 409 && action === 'update') {
      return 'La entrada cambió mientras la actualizabas. Se han vuelto a cargar los datos.';
    }
    if (error.status === 503)
      return 'El servicio no está disponible ahora. Inténtalo de nuevo más tarde.';
    if (error.status === 0) return 'No se pudo conectar con el servidor. Comprueba tu conexión.';
  }
  return action === 'load'
    ? 'No se pudo cargar tu biblioteca. Inténtalo de nuevo.'
    : 'No se pudo guardar el cambio. Inténtalo de nuevo.';
}

function getRatingErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
    if (error.status === 404) return 'La entrada ya no está disponible en tu biblioteca.';
    if (error.status === 429) return 'Demasiadas consultas de valoraciones. Espera un minuto.';
    if (error.status === 503)
      return 'El servicio no está disponible ahora. Inténtalo de nuevo más tarde.';
    if (error.status === 0) return 'No se pudo conectar con el servidor. Comprueba tu conexión.';
  }
  return 'No se pudo cargar tu valoración. Abre el editor para volver a intentarlo.';
}

export function LibraryPage({
  onUnauthorized,
  noticeTimeoutMs = NOTICE_TIMEOUT_MS,
}: {
  onUnauthorized: () => void;
  /** Solo se cambia en las pruebas, para no esperar el tiempo real del aviso. */
  noticeTimeoutMs?: number;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    type: 'all',
    status: 'all',
    favorite: 'all',
    sortBy: 'addedAt',
    sortOrder: 'desc',
  });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<LibraryListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const pendingIdsRef = useRef(new Set<string>());
  const [deleteTarget, setDeleteTarget] = useState<LibraryEntryView | null>(null);
  const [ratingTarget, setRatingTarget] = useState<LibraryEntryView | null>(null);
  const [seasonsTarget, setSeasonsTarget] = useState<LibraryEntryView | null>(null);
  const [ratings, setRatings] = useState<Record<string, RatingView | null>>({});
  const [ratingErrors, setRatingErrors] = useState<Record<string, string>>({});
  const [ratingLoadingIds, setRatingLoadingIds] = useState<Set<string>>(() => new Set());
  const requestedRatingIds = useRef(new Set<string>());
  const [refreshKey, setRefreshKey] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const query = useMemo(() => toListQuery(filters, page), [filters, page]);
  const unauthorizedHandler = useRef(onUnauthorized);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const libraryHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    unauthorizedHandler.current = onUnauthorized;
  }, [onUnauthorized]);

  // Los avisos de éxito se retiran solos; los errores esperan a la siguiente acción.
  useEffect(() => {
    if (!actionNotice) return undefined;
    const timer = window.setTimeout(() => setActionNotice(''), noticeTimeoutMs);
    return () => window.clearTimeout(timer);
  }, [actionNotice, noticeTimeoutMs]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');

    listLibrary(query, controller.signal)
      .then((response) => {
        if (active) setResult(response);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          unauthorizedHandler.current();
        }
        setLoadError(getErrorMessage(error, 'load'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [query, refreshKey, reloadKey]);

  useEffect(() => {
    if (deleteTarget) {
      cancelDeleteRef.current?.focus();
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeDeleteDialog();
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
    return undefined;
  }, [deleteTarget]);

  useEffect(() => {
    if (!loading && result && page > Math.max(1, result.totalPages)) {
      setPage(Math.max(1, result.totalPages));
    }
  }, [loading, page, result]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function handleMutationError(error: unknown, action: 'update' | 'delete') {
    if (error instanceof ApiError && error.status === 401) {
      unauthorizedHandler.current();
    }
    setActionError(getErrorMessage(error, action));
    if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
      setRefreshKey((current) => current + 1);
    }
  }

  async function changeEntry(
    entry: LibraryEntryView,
    update: { status?: LibraryEntryStatus; isFavorite?: boolean },
  ) {
    if (pendingIdsRef.current.has(entry.id)) return;
    pendingIdsRef.current.add(entry.id);
    setPendingIds((current) => new Set(current).add(entry.id));
    setActionError('');
    setActionNotice('');
    try {
      await updateLibraryEntry(entry.id, update);
      setActionNotice('El cambio se guardó correctamente.');
      setRefreshKey((current) => current + 1);
    } catch (error) {
      handleMutationError(error, 'update');
    } finally {
      pendingIdsRef.current.delete(entry.id);
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(entry.id);
        return next;
      });
    }
  }

  function requestDelete(entry: LibraryEntryView, trigger: HTMLButtonElement) {
    previousFocusRef.current = trigger;
    setDeleteTarget(entry);
    setActionError('');
    setActionNotice('');
  }

  function closeDeleteDialog() {
    setDeleteTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    if (pendingIdsRef.current.has(target.id)) return;
    pendingIdsRef.current.add(target.id);
    setPendingIds((current) => new Set(current).add(target.id));
    setActionError('');
    setActionNotice('');
    try {
      await deleteLibraryEntry(target.id);
      setRatings((current) => {
        const next = { ...current };
        delete next[target.id];
        return next;
      });
      setActionNotice('La entrada se eliminó de tu biblioteca.');
      previousFocusRef.current = libraryHeadingRef.current;
      setDeleteTarget(null);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setActionNotice('La entrada ya no estaba disponible y se ha actualizado la biblioteca.');
        previousFocusRef.current = libraryHeadingRef.current;
        setDeleteTarget(null);
        setRefreshKey((current) => current + 1);
      } else {
        handleMutationError(error, 'delete');
      }
    } finally {
      pendingIdsRef.current.delete(target.id);
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(target.id);
        return next;
      });
    }
  }

  const results = result?.results ?? [];
  const activeFilterCount =
    (filters.type === 'all' ? 0 : 1) +
    (filters.status === 'all' ? 0 : 1) +
    (filters.favorite === 'all' ? 0 : 1);
  const isFiltered = activeFilterCount > 0;

  function clearFilters() {
    setFilters({
      type: 'all',
      status: 'all',
      favorite: 'all',
      sortBy: 'addedAt',
      sortOrder: 'desc',
    });
    setPage(1);
  }

  useEffect(() => {
    const entriesToLoad = results.filter(
      (entry) => !Object.hasOwn(ratings, entry.id) && !requestedRatingIds.current.has(entry.id),
    );
    if (entriesToLoad.length === 0) return;

    for (const entry of entriesToLoad) requestedRatingIds.current.add(entry.id);
    setRatingLoadingIds((current) => new Set([...current, ...entriesToLoad.map(({ id }) => id)]));

    for (const entry of entriesToLoad) {
      void getRating(entry.id)
        .then((rating) => {
          setRatings((current) => ({ ...current, [entry.id]: rating }));
          setRatingErrors((current) => {
            const next = { ...current };
            delete next[entry.id];
            return next;
          });
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401) unauthorizedHandler.current();
          setRatingErrors((current) => ({
            ...current,
            [entry.id]: getRatingErrorMessage(error),
          }));
        })
        .finally(() => {
          setRatingLoadingIds((current) => {
            const next = new Set(current);
            next.delete(entry.id);
            return next;
          });
        });
    }
  }, [ratings, results]);

  return (
    <section aria-labelledby="library-title" className="space-y-6 sm:space-y-8">
      <header className="space-y-2">
        <span className="text-xs font-bold tracking-[0.16em] text-red-300 uppercase">
          Tu espacio personal
        </span>
        <h1
          ref={libraryHeadingRef}
          id="library-title"
          tabIndex={-1}
          className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl"
        >
          Mi biblioteca
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
          Organiza las películas y series que quieres ver y las que ya has terminado.
        </p>
      </header>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-400" aria-live="polite">
            {loading
              ? 'Actualizando biblioteca…'
              : `${result?.totalResults ?? 0} ${result?.totalResults === 1 ? 'entrada' : 'entradas'}`}
          </p>
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="library-filters"
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-600 px-3 text-sm font-semibold text-slate-200 hover:border-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 sm:hidden"
          >
            <span aria-hidden="true">⚙</span>
            Filtros
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-red-800 px-2 text-xs font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        <div
          id="library-filters"
          className={`${filtersOpen ? 'grid' : 'hidden'} gap-3 rounded-2xl border border-slate-700 bg-slate-800/60 p-4 sm:grid sm:grid-cols-2 sm:p-5 lg:grid-cols-4`}
        >
          <label className="grid gap-1.5 text-xs font-medium text-slate-300">
            Tipo
            <select
              aria-label="Filtrar por tipo"
              value={filters.type}
              onChange={(event) => updateFilter('type', event.target.value as TypeFilter)}
              className="min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
            >
              <option value="all">Todos</option>
              <option value="movie">Películas</option>
              <option value="tv">Series</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-slate-300">
            Estado
            <select
              aria-label="Filtrar por estado"
              value={filters.status}
              onChange={(event) => updateFilter('status', event.target.value as StatusFilter)}
              className="min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
            >
              <option value="all">Todos los estados</option>
              {LIBRARY_ENTRY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status === 'PENDING'
                    ? 'Pendiente'
                    : status === 'WATCHING'
                      ? 'Viendo'
                      : status === 'COMPLETED'
                        ? 'Completado'
                        : 'Abandonado'}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-slate-300">
            Favoritos
            <select
              aria-label="Filtrar por favoritos"
              value={filters.favorite}
              onChange={(event) => updateFilter('favorite', event.target.value as FavoriteFilter)}
              className="min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
            >
              <option value="all">Todos</option>
              <option value="favorites">Solo favoritos</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-slate-300">
            Ordenar por
            <select
              aria-label="Ordenar por"
              value={`${filters.sortBy}:${filters.sortOrder}`}
              onChange={(event) => {
                const [sortBy, sortOrder] = event.target.value.split(':') as [
                  LibrarySortBy,
                  LibrarySortOrder,
                ];
                updateFilter('sortBy', sortBy);
                updateFilter('sortOrder', sortOrder);
              }}
              className="min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
            >
              <option value="addedAt:desc">Añadidos recientemente</option>
              <option value="addedAt:asc">Añadidos hace más tiempo</option>
              <option value="updatedAt:desc">Actualizados recientemente</option>
              <option value="updatedAt:asc">Actualizados hace más tiempo</option>
            </select>
          </label>

          {isFiltered && (
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-11 cursor-pointer rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-100 hover:border-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 sm:col-span-2 lg:col-span-4"
            >
              Quitar filtros
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-slate-700 bg-slate-800/60 px-6 py-12 text-center text-slate-300"
        >
          <span className="inline-block animate-pulse motion-reduce:animate-none">
            Cargando tu biblioteca…
          </span>
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 px-6 py-12 text-center">
          <p role="alert" className="text-sm text-red-200">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            className="mt-4 min-h-11 cursor-pointer rounded-lg bg-red-800 px-4 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
          >
            Reintentar
          </button>
        </div>
      ) : result?.totalResults === 0 ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 px-6 py-12 text-center">
          <span aria-hidden="true" className="text-3xl text-red-300">
            {isFiltered ? '⌕' : '▤'}
          </span>
          <h2 className="mt-3 text-lg font-semibold text-slate-50">
            {isFiltered ? 'No hay resultados con estos filtros' : 'Tu biblioteca está vacía'}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
            {isFiltered
              ? 'Prueba a cambiar los filtros para encontrar otras entradas.'
              : 'Explora el catálogo y añade películas o series para tenerlas a mano.'}
          </p>
          {isFiltered && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 min-h-11 cursor-pointer rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-100 hover:border-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
            >
              Quitar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <div aria-busy={pendingIds.size > 0} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((entry) => (
              <LibraryEntryCard
                key={entry.id}
                entry={entry}
                busy={pendingIds.has(entry.id)}
                onStatusChange={(current, status) => {
                  if (current.status !== status) void changeEntry(current, { status });
                }}
                onToggleFavorite={(current) =>
                  void changeEntry(current, { isFavorite: !current.isFavorite })
                }
                onRequestDelete={requestDelete}
                rating={ratings[entry.id]}
                ratingLoading={
                  ratingLoadingIds.has(entry.id) ||
                  (!Object.hasOwn(ratings, entry.id) && !ratingErrors[entry.id])
                }
                ratingError={ratingErrors[entry.id]}
                onManageRating={setRatingTarget}
                onManageSeasons={setSeasonsTarget}
              />
            ))}
          </div>
          <nav
            aria-label="Paginación de biblioteca"
            className="flex items-center justify-center gap-4"
          >
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="min-h-11 cursor-pointer rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-200 hover:border-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm text-slate-300" aria-live="polite">
              Página {page} de {result?.totalPages ?? 0}
            </span>
            <button
              type="button"
              disabled={page >= (result?.totalPages ?? 0) || loading}
              onClick={() => setPage((current) => current + 1)}
              className="min-h-11 cursor-pointer rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-200 hover:border-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente
            </button>
          </nav>
        </>
      )}

      {(actionError || actionNotice) && (
        <div className="toast-dock">
          {actionError ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-red-800 bg-red-950/95 p-4 text-sm text-red-100 shadow-lg shadow-black/40"
            >
              <span className="flex-1">{actionError}</span>
              <button
                type="button"
                onClick={() => setActionError('')}
                aria-label="Cerrar aviso"
                className="-m-2 cursor-pointer p-2 text-lg leading-none text-red-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          ) : (
            <p
              role="status"
              className="rounded-xl border border-emerald-800 bg-emerald-950/95 p-4 text-sm text-emerald-100 shadow-lg shadow-black/40"
            >
              {actionNotice}
            </p>
          )}
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeleteDialog();
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-library-title"
            aria-describedby="delete-library-description"
            onKeyDown={(event) => {
              if (event.key !== 'Tab') return;
              const focusable =
                event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)');
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
            className="w-full max-w-md rounded-2xl border border-slate-600 bg-slate-900 p-6 shadow-2xl shadow-black/60"
          >
            <h2 id="delete-library-title" className="text-lg font-semibold text-slate-50">
              ¿Eliminar de tu biblioteca?
            </h2>
            <p
              id="delete-library-description"
              className="mt-2 text-sm leading-relaxed text-slate-300"
            >
              Se eliminará «{deleteTarget.media?.title || 'Título no disponible'}» de tu biblioteca.
              No se eliminará el contenido global.
            </p>
            <div className="mt-6 flex flex-col-reverse justify-end gap-3 sm:flex-row">
              <button
                ref={cancelDeleteRef}
                type="button"
                onClick={closeDeleteDialog}
                disabled={pendingIds.has(deleteTarget.id)}
                className="min-h-11 cursor-pointer rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-100 hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={pendingIds.has(deleteTarget.id)}
                aria-busy={pendingIds.has(deleteTarget.id)}
                className="min-h-11 cursor-pointer rounded-lg bg-red-800 px-4 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-wait disabled:opacity-60"
              >
                {pendingIds.has(deleteTarget.id) ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {seasonsTarget && (
        <SeasonProgressDialog
          key={seasonsTarget.id}
          entryId={seasonsTarget.id}
          title={seasonsTarget.media?.title || 'Título no disponible'}
          onClose={() => setSeasonsTarget(null)}
          onUnauthorized={() => unauthorizedHandler.current()}
        />
      )}
      {ratingTarget && (
        <RatingDialog
          key={ratingTarget.id}
          entryId={ratingTarget.id}
          title={ratingTarget.media?.title || 'Título no disponible'}
          initialRating={ratings[ratingTarget.id]}
          onClose={() => setRatingTarget(null)}
          onUnauthorized={() => unauthorizedHandler.current()}
          onRatingChange={(rating) => {
            setRatings((current) => ({ ...current, [ratingTarget.id]: rating }));
            setRatingErrors((current) => {
              const next = { ...current };
              delete next[ratingTarget.id];
              return next;
            });
          }}
        />
      )}
    </section>
  );
}
