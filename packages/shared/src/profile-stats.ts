export interface ProfileStatsCounts {
  /** Entradas con estado `COMPLETED`. Cuenta títulos, no temporadas. */
  completed: number;
  /** Entradas con estado `PENDING`. */
  pending: number;
}

export interface ProfileStatsRatings {
  /**
   * Media de las puntuaciones personales en la escala 0,0–10,0, con un decimal.
   * `null` cuando no hay ninguna puntuación: no se presenta una media de cero.
   */
  average: number | null;
  /** Puntuaciones que entran en la media. Las reseñas sin nota no cuentan. */
  count: number;
}

export interface ProfileStatsView {
  movies: ProfileStatsCounts;
  series: ProfileStatsCounts;
  ratings: ProfileStatsRatings;
}
