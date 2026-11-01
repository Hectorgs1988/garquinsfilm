export const SEASON_NUMBER_MAX = 9999;
export const SEASON_PROGRESS_MAX_PER_ENTRY = 500;
export const SEASON_PROGRESS_BATCH_MAX = 100;

export interface SeasonProgressItem {
  seasonNumber: number;
  completedAt: string;
}

export interface SeasonProgressView {
  libraryEntryId: string;
  completedSeasons: SeasonProgressItem[];
}

export interface SeasonProgressBatchInput {
  complete?: number[];
  uncomplete?: number[];
}
