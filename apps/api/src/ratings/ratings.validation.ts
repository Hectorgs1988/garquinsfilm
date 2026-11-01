import type { RatingPutInput } from '@garquinsfilm/shared';

const inputKeys = new Set(['score', 'review', 'containsSpoilers']);
const MAX_REVIEW_CODE_POINTS = 2_000;

export class RatingValidationError extends Error {
  constructor() {
    super('Rating input is invalid.');
    this.name = 'RatingValidationError';
  }
}

export function validateRatingPutInput(value: unknown): RatingPutInput {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== inputKeys.size ||
    Object.keys(value).some((key) => !inputKeys.has(key)) ||
    !Object.hasOwn(value, 'score') ||
    !Object.hasOwn(value, 'review') ||
    !Object.hasOwn(value, 'containsSpoilers')
  ) {
    throw new RatingValidationError();
  }

  const score = value.score;
  const review = normalizeReview(value.review);
  const containsSpoilers = value.containsSpoilers;

  if (
    (score !== null && !isValidScore(score)) ||
    typeof containsSpoilers !== 'boolean' ||
    (score === null && review === null) ||
    (review === null && containsSpoilers)
  ) {
    throw new RatingValidationError();
  }

  return {
    score,
    review,
    containsSpoilers,
  };
}

export function validateRatingEntryId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new RatingValidationError();
  }
  return value;
}

export function scoreToTenths(score: number | null): number | null {
  return score === null ? null : score * 10;
}

function isValidScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 10 &&
    Number.isInteger(value * 10)
  );
}

function normalizeReview(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.includes('\0') || hasUnpairedSurrogate(value)) {
    throw new RatingValidationError();
  }
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return null;
  if ([...normalized].length > MAX_REVIEW_CODE_POINTS) {
    throw new RatingValidationError();
  }
  return normalized;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
