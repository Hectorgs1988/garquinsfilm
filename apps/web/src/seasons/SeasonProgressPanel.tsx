import { useMemo } from 'react';
import type { TvSeason } from '@garquinsfilm/shared';

import {
  calculateSeasonProgress,
  planMarkUpTo,
  toIsoDate,
  type SeasonProgressSummary,
  type SeasonRow,
} from './season-progress.js';
import { useSeasonProgress } from './useSeasonProgress.js';

interface SeasonProgressPanelProps {
  entryId: string;
  /** Temporadas del catálogo; `null` si no hay metadatos disponibles. */
  seasons: TvSeason[] | null;
  /** Estado de emisión de TMDB (`TvDetail.status`), si se conoce. */
  seriesStatus?: string | null;
  onUnauthorized: () => void;
  /** Fecha de referencia para detectar estrenos futuros (inyectable en tests). */
  today?: string;
}

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date);
}

function seasonLabel(season: TvSeason): string {
  return season.seasonNumber === 0 || season.isSpecial
    ? 'Especiales'
    : `Temporada ${season.seasonNumber}`;
}

const buttonBase =
  'min-h-11 cursor-pointer rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none';

export function SeasonProgressPanel({
  entryId,
  seasons,
  seriesStatus = null,
  onUnauthorized,
  today,
}: SeasonProgressPanelProps) {
  const progress = useSeasonProgress(entryId, onUnauthorized);
  const todayIso = today ?? toIsoDate(new Date());
  const summary = useMemo(
    () => calculateSeasonProgress(seasons, progress.completed, todayIso),
    [seasons, progress.completed, todayIso],
  );
  const busy = progress.pending !== null;

  function handleMarkUpTo(row: SeasonRow) {
    const plan = planMarkUpTo(summary, row.season.seasonNumber);
    if (plan.kind === 'too_many') {
      progress.showError(
        `Hay ${plan.count} temporadas pendientes hasta aquí y el máximo por acción es 100. ` +
          'Marca primero las temporadas más recientes por separado.',
      );
      return;
    }
    if (plan.kind === 'ok') {
      void progress.completeMany(plan.seasonNumbers, `Hasta ${seasonLabel(row.season)}`);
    }
  }

  return (
    <div className="space-y-4" aria-busy={busy || progress.loadState === 'loading' || undefined}>
      {progress.loadState === 'loading' && (
        <p role="status" className="text-sm text-slate-300">
          Cargando tus temporadas…
        </p>
      )}

      {progress.loadState === 'error' && (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-red-200">
            {progress.loadError}
          </p>
          <button
            type="button"
            onClick={() => void progress.reload()}
            className={`${buttonBase} border-slate-600 bg-slate-900 text-slate-100 hover:border-red-300`}
          >
            Reintentar
          </button>
        </div>
      )}

      {progress.loadState === 'ready' && (
        <>
          <ProgressSummary summary={summary} seriesStatus={seriesStatus} />

          <div aria-live="polite" className="min-h-5">
            {progress.feedback && (
              <p
                role={progress.feedback.kind === 'error' ? 'alert' : 'status'}
                className={`text-sm ${
                  progress.feedback.kind === 'error' ? 'text-red-200' : 'text-emerald-200'
                }`}
              >
                {progress.feedback.text}
              </p>
            )}
          </div>

          {seasons === null && (
            <p className="text-sm text-slate-400">
              No hay datos de temporadas disponibles ahora. Se muestran solo los números de tus
              temporadas completadas.
            </p>
          )}

          {summary.regular.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2" aria-label="Temporadas regulares">
              {summary.regular.map((row) => (
                <SeasonItem
                  key={row.season.seasonNumber}
                  row={row}
                  busy={busy}
                  pendingKey={progress.pending}
                  showMarkUpTo={
                    row.eligible &&
                    summary.regular.some(
                      (other) =>
                        other.eligible &&
                        !other.completed &&
                        other.season.seasonNumber < row.season.seasonNumber,
                    )
                  }
                  onComplete={() =>
                    void progress.complete(row.season.seasonNumber, seasonLabel(row.season))
                  }
                  onUncomplete={() =>
                    void progress.uncomplete(row.season.seasonNumber, seasonLabel(row.season))
                  }
                  onMarkUpTo={() => handleMarkUpTo(row)}
                />
              ))}
            </ul>
          )}

          {summary.specials && (
            <section aria-labelledby={`specials-${entryId}`} className="space-y-2">
              <h3 id={`specials-${entryId}`} className="text-sm font-semibold text-slate-200">
                Especiales
              </h3>
              <p className="text-xs text-slate-400">No cuentan para el porcentaje.</p>
              <ul className="grid gap-3 sm:grid-cols-2">
                <SeasonItem
                  row={summary.specials}
                  busy={busy}
                  pendingKey={progress.pending}
                  showMarkUpTo={false}
                  onComplete={() => void progress.complete(0, 'Especiales')}
                  onUncomplete={() => void progress.uncomplete(0, 'Especiales')}
                  onMarkUpTo={() => undefined}
                />
              </ul>
            </section>
          )}

          {summary.orphans.length > 0 && (
            <section aria-labelledby={`orphans-${entryId}`} className="space-y-2">
              <h3 id={`orphans-${entryId}`} className="text-sm font-semibold text-slate-200">
                {seasons === null
                  ? 'Temporadas completadas'
                  : 'Temporadas no disponibles en el catálogo'}
              </h3>
              <p className="text-xs text-slate-400">
                {seasons === null
                  ? 'No cuentan para ningún porcentaje mientras no haya datos de temporadas.'
                  : 'Las marcaste como vistas, pero ya no aparecen en el catálogo. No cuentan para el porcentaje.'}
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {summary.orphans.map((number) => (
                  <li
                    key={number}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-50">Temporada {number}</p>
                      <StatusBadge tone="done">Vista</StatusBadge>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Desmarcar Temporada ${number} como vista`}
                      onClick={() => void progress.uncomplete(number, `Temporada ${number}`)}
                      className={`${buttonBase} border-slate-600 bg-slate-900 text-slate-100 hover:border-red-300`}
                    >
                      {progress.pending === `season:${number}` ? 'Guardando…' : 'Desmarcar'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {seasons !== null &&
            summary.regular.length === 0 &&
            !summary.specials &&
            summary.orphans.length === 0 && (
              <p className="text-sm text-slate-400">
                No hay temporadas disponibles para esta serie.
              </p>
            )}
        </>
      )}
    </div>
  );
}

function ProgressSummary({
  summary,
  seriesStatus,
}: {
  summary: SeasonProgressSummary;
  seriesStatus: string | null;
}) {
  const finished = seriesStatus === 'Ended' || seriesStatus === 'Canceled';
  const countText = summary.hasMetadata
    ? `${summary.eligibleCompleted} de ${summary.eligibleTotal} ${
        summary.eligibleTotal === 1 ? 'temporada completada' : 'temporadas completadas'
      }`
    : `${summary.completedCount} ${
        summary.completedCount === 1 ? 'temporada completada' : 'temporadas completadas'
      }`;

  return (
    <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <p className="text-sm font-semibold text-slate-50">
        {countText}
        {summary.percent !== null && <span className="text-slate-300"> · {summary.percent} %</span>}
      </p>
      {summary.percent !== null ? (
        <div
          role="progressbar"
          aria-label="Progreso de temporadas"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.percent}
          aria-valuetext={`${countText} (${summary.percent} %)`}
          className="h-2.5 overflow-hidden rounded-full bg-slate-700"
        >
          <div
            className="h-full rounded-full bg-red-600 transition-[width] motion-reduce:transition-none"
            style={{ width: `${summary.percent}%` }}
          />
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          Progreso indeterminado: aún no hay datos suficientes de temporadas para calcular un
          porcentaje.
        </p>
      )}
      {summary.allEligibleCompleted && (
        <p className="text-sm font-medium text-emerald-200">
          {finished && !summary.hasUpcoming
            ? 'Serie completada.'
            : 'Al día con las temporadas estrenadas.'}
        </p>
      )}
    </div>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: 'done' | 'pending' | 'upcoming';
  children: string;
}) {
  const classes = {
    done: 'border-emerald-700/60 bg-emerald-950/40 text-emerald-200',
    pending: 'border-slate-600 bg-slate-800 text-slate-300',
    upcoming: 'border-amber-700/60 bg-amber-950/30 text-amber-200',
  }[tone];
  return (
    <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs ${classes}`}>
      {children}
    </span>
  );
}

function SeasonItem({
  row,
  busy,
  pendingKey,
  showMarkUpTo,
  onComplete,
  onUncomplete,
  onMarkUpTo,
}: {
  row: SeasonRow;
  busy: boolean;
  pendingKey: string | null;
  showMarkUpTo: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  onMarkUpTo: () => void;
}) {
  const { season } = row;
  const label = seasonLabel(season);
  const airDate = formatDate(season.airDate);
  const saving = pendingKey === `season:${season.seasonNumber}`;
  const showName = season.name && season.name !== label && season.name !== 'Especiales';

  return (
    <li className="min-w-0 space-y-3 rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <div className="min-w-0">
        <h4 className="font-semibold text-slate-50">{label}</h4>
        {showName && <p className="mt-1 text-sm text-slate-300">{season.name}</p>}
        {season.episodeCount > 0 && (
          <p className="mt-1 text-sm text-slate-300">
            {season.episodeCount} {season.episodeCount === 1 ? 'episodio' : 'episodios'}
          </p>
        )}
        {airDate && <p className="mt-1 text-xs text-slate-400">{airDate}</p>}
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={row.completed ? 'done' : 'pending'}>
            {row.completed ? 'Vista' : 'Pendiente'}
          </StatusBadge>
          {row.upcoming && <StatusBadge tone="upcoming">Próximamente</StatusBadge>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {row.completed ? (
          <button
            type="button"
            disabled={busy}
            aria-label={`Desmarcar ${label} como vista`}
            onClick={onUncomplete}
            className={`${buttonBase} border-slate-600 bg-slate-900 text-slate-100 hover:border-red-300`}
          >
            {saving ? 'Guardando…' : 'Desmarcar'}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || row.upcoming}
            aria-label={`Marcar ${label} como vista`}
            onClick={onComplete}
            className={`${buttonBase} border-red-800 bg-red-900/60 text-red-50 hover:border-red-400`}
          >
            {saving ? 'Guardando…' : 'Marcar como vista'}
          </button>
        )}
        {showMarkUpTo && (
          <button
            type="button"
            disabled={busy}
            aria-label={`Marcar hasta ${label}`}
            onClick={onMarkUpTo}
            className={`${buttonBase} border-slate-600 bg-slate-900 text-slate-200 hover:border-red-300`}
          >
            {pendingKey === 'batch' ? 'Guardando…' : 'Marcar hasta esta temporada'}
          </button>
        )}
      </div>
    </li>
  );
}
