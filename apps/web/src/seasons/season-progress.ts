import { SEASON_PROGRESS_BATCH_MAX } from '@garquinsfilm/shared';
import type { SeasonProgressItem, TvSeason } from '@garquinsfilm/shared';

export interface SeasonRow {
  season: TvSeason;
  completed: boolean;
  /** Estreno claramente futuro: se muestra como «Próximamente» y no puede marcarse. */
  upcoming: boolean;
  /** Cuenta para el porcentaje principal. */
  eligible: boolean;
}

export interface SeasonProgressSummary {
  /** Temporadas regulares (>= 1) del catálogo, ordenadas por número. */
  regular: SeasonRow[];
  /** Temporada 0, separada. También existe si solo consta como completada en el backend. */
  specials: SeasonRow | null;
  /** Temporadas completadas ausentes del catálogo (o todas, si no hay metadatos). */
  orphans: number[];
  eligibleTotal: number;
  eligibleCompleted: number;
  /** `null` cuando no hay temporadas elegibles (progreso indeterminado). */
  percent: number | null;
  /** Todas las temporadas completadas guardadas, incluidos especiales y huérfanas. */
  completedCount: number;
  hasMetadata: boolean;
  allEligibleCompleted: boolean;
  hasUpcoming: boolean;
}

/** Fecha local de hoy como `YYYY-MM-DD`, comparable con `TvSeason.airDate`. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isUpcoming(season: TvSeason, today: string): boolean {
  return season.airDate !== null && season.airDate > today;
}

function isSpecialSeason(season: TvSeason): boolean {
  return season.seasonNumber === 0 || season.isSpecial;
}

/**
 * Calcula el progreso a partir del catálogo (`TvDetail.seasons`) y las temporadas
 * completadas del backend. Función pura: `today` se inyecta para poder probarla.
 *
 * - Denominador: temporadas con número >= 1, `episodeCount > 0` y sin estreno futuro.
 *   Una fecha nula con episodios conocidos cuenta.
 * - Numerador: solo temporadas del denominador completadas.
 * - Especiales, futuras y huérfanas quedan fuera del porcentaje.
 * - Sin temporadas elegibles (o sin metadatos): `percent` es `null`.
 */
export function calculateSeasonProgress(
  seasons: readonly TvSeason[] | null,
  completedSeasons: readonly SeasonProgressItem[],
  today: string,
): SeasonProgressSummary {
  const completedSet = new Set(completedSeasons.map((item) => item.seasonNumber));
  const catalog = seasons ?? [];

  const toRow = (season: TvSeason): SeasonRow => {
    const upcoming = isUpcoming(season, today);
    return {
      season,
      completed: completedSet.has(season.seasonNumber),
      upcoming,
      eligible: season.seasonNumber >= 1 && season.episodeCount > 0 && !upcoming,
    };
  };

  const regular = catalog
    .filter((season) => !isSpecialSeason(season))
    .map(toRow)
    .sort((a, b) => a.season.seasonNumber - b.season.seasonNumber);

  const catalogSpecial = catalog.find(isSpecialSeason);
  let specials: SeasonRow | null = catalogSpecial ? toRow(catalogSpecial) : null;
  if (!specials && completedSet.has(0)) {
    specials = {
      season: {
        seasonNumber: 0,
        name: 'Especiales',
        episodeCount: 0,
        airDate: null,
        posterUrl: null,
        isSpecial: true,
      },
      completed: true,
      upcoming: false,
      eligible: false,
    };
  }

  const known = new Set(catalog.map((season) => season.seasonNumber));
  // Sin metadatos, todas las completadas quedan sin catálogo: se listan por número.
  const orphans = [...completedSet]
    .filter((number) => number !== 0 && !known.has(number))
    .sort((a, b) => a - b);

  const eligible = regular.filter((row) => row.eligible);
  const eligibleCompleted = eligible.filter((row) => row.completed).length;
  const percent =
    eligible.length === 0
      ? null
      : Math.min(100, Math.round((eligibleCompleted / eligible.length) * 100));

  return {
    regular,
    specials,
    orphans,
    eligibleTotal: eligible.length,
    eligibleCompleted,
    percent,
    completedCount: completedSet.size,
    hasMetadata: seasons !== null && eligible.length > 0,
    allEligibleCompleted: eligible.length > 0 && eligibleCompleted === eligible.length,
    hasUpcoming: regular.some((row) => row.upcoming),
  };
}

export type CatchUpPlan =
  | { kind: 'ok'; seasonNumbers: number[] }
  | { kind: 'nothing' }
  | { kind: 'too_many'; count: number };

/**
 * Temporadas pendientes a marcar con «Marcar hasta esta temporada»: regulares elegibles
 * con número <= `upTo`, sin completar. Nunca se inventan números ausentes del catálogo.
 * Si excede el máximo por lote no se trocea: se informa al usuario.
 */
export function planMarkUpTo(summary: SeasonProgressSummary, upTo: number): CatchUpPlan {
  const seasonNumbers = summary.regular
    .filter((row) => row.eligible && !row.completed && row.season.seasonNumber <= upTo)
    .map((row) => row.season.seasonNumber);
  if (seasonNumbers.length === 0) return { kind: 'nothing' };
  if (seasonNumbers.length > SEASON_PROGRESS_BATCH_MAX) {
    return { kind: 'too_many', count: seasonNumbers.length };
  }
  return { kind: 'ok', seasonNumbers };
}
