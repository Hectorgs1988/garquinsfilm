import {
  SEASON_NUMBER_MAX,
  SEASON_PROGRESS_BATCH_MAX,
  type SeasonProgressBatchInput,
} from '@garquinsfilm/shared';

export class SeasonProgressValidationError extends Error {
  constructor() {
    super('Season progress input is invalid.');
    this.name = 'SeasonProgressValidationError';
  }
}

// Canonical decimal integers only: no signs, leading zeros, decimals or exponents.
const seasonNumberPattern = /^(0|[1-9]\d{0,3})$/;

export function validateSeasonProgressEntryId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new SeasonProgressValidationError();
  }
  return value;
}

export function parseSeasonNumberParam(value: unknown): number {
  if (typeof value !== 'string' || !seasonNumberPattern.test(value)) {
    throw new SeasonProgressValidationError();
  }
  return assertSeasonNumber(Number(value));
}

export interface ValidatedSeasonBatch {
  complete: number[];
  uncomplete: number[];
}

export function validateSeasonProgressBatch(value: unknown): ValidatedSeasonBatch {
  if (!isRecord(value)) throw new SeasonProgressValidationError();
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => key !== 'complete' && key !== 'uncomplete')) {
    throw new SeasonProgressValidationError();
  }

  const input = value as SeasonProgressBatchInput;
  const complete = readSeasonList(input.complete);
  const uncomplete = readSeasonList(input.uncomplete);
  if (complete.length + uncomplete.length === 0) throw new SeasonProgressValidationError();
  if (complete.length + uncomplete.length > SEASON_PROGRESS_BATCH_MAX) {
    throw new SeasonProgressValidationError();
  }
  const completeSet = new Set(complete);
  if (uncomplete.some((seasonNumber) => completeSet.has(seasonNumber))) {
    throw new SeasonProgressValidationError();
  }
  return { complete, uncomplete };
}

function readSeasonList(value: unknown): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > SEASON_PROGRESS_BATCH_MAX) {
    throw new SeasonProgressValidationError();
  }
  const seasons = value.map((item) => {
    if (typeof item !== 'number') throw new SeasonProgressValidationError();
    return assertSeasonNumber(item);
  });
  if (new Set(seasons).size !== seasons.length) throw new SeasonProgressValidationError();
  return seasons;
}

function assertSeasonNumber(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > SEASON_NUMBER_MAX) {
    throw new SeasonProgressValidationError();
  }
  // Normalises -0 so it can never reach storage as a distinct value.
  return value + 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
