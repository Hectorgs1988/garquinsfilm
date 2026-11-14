import { useEffect, useState } from 'react';
import type { ProfileStatsView } from '@garquinsfilm/shared';

import { ApiError } from '../api.js';
import { getProfileStats } from './stats.api.js';

function formatScore(score: number): string {
  return score.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-slate-50">{value}</dd>
      {detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}
    </div>
  );
}

export function ProfileStats({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [stats, setStats] = useState<ProfileStatsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError('');

    getProfileStats(controller.signal)
      .then((loaded) => {
        if (active) setStats(loaded);
      })
      .catch((caught: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 401) {
          onUnauthorized();
          return;
        }
        setError('No se pudieron cargar tus estadísticas.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey, onUnauthorized]);

  const pending = stats ? stats.movies.pending + stats.series.pending : 0;

  return (
    <section aria-labelledby="profile-stats-title" className="space-y-3">
      <h2 id="profile-stats-title" className="text-lg font-semibold text-slate-100">
        Tu actividad
      </h2>

      {loading ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-slate-700 bg-slate-800/60 px-6 py-8 text-center text-sm text-slate-300"
        >
          <span className="inline-block animate-pulse motion-reduce:animate-none">
            Contando tus títulos…
          </span>
        </p>
      ) : error ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 px-6 py-8 text-center">
          <p role="alert" className="text-sm text-red-200">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            className="mt-3 min-h-11 cursor-pointer rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-100 hover:border-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
          >
            Reintentar
          </button>
        </div>
      ) : stats ? (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Películas vistas" value={String(stats.movies.completed)} />
          <Metric label="Series terminadas" value={String(stats.series.completed)} />
          <Metric
            label="Pendientes"
            value={String(pending)}
            detail={
              pending > 0
                ? `${plural(stats.movies.pending, 'película', 'películas')} · ${plural(
                    stats.series.pending,
                    'serie',
                    'series',
                  )}`
                : undefined
            }
          />
          <Metric
            label="Nota media"
            value={stats.ratings.average === null ? '—' : formatScore(stats.ratings.average)}
            detail={
              stats.ratings.average === null
                ? 'Sin valoraciones'
                : plural(stats.ratings.count, 'valoración', 'valoraciones')
            }
          />
        </dl>
      ) : null}
    </section>
  );
}
