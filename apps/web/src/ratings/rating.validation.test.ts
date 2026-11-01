import { describe, expect, it } from 'vitest';

import {
  isValidRatingReview,
  normalizeRatingReview,
  parseRatingScore,
  ratingReviewLength,
} from './rating.validation.js';

describe('rating input validation', () => {
  it('accepts empty score as absent and valid endpoints/decimals including Spanish commas', () => {
    expect(parseRatingScore('')).toBeNull();
    expect(parseRatingScore('0')).toBe(0);
    expect(parseRatingScore('0,1')).toBe(0.1);
    expect(parseRatingScore('10')).toBe(10);
    expect(parseRatingScore('7.8')).toBe(7.8);
    expect(parseRatingScore('7,8')).toBe(7.8);
  });

  it.each(['-0.1', '10.1', '7.85', 'NaN', 'Infinity', '1,25', 'abc'])(
    'rejects invalid score %s without rounding',
    (score) => {
      expect(parseRatingScore(score)).toBeUndefined();
    },
  );

  it('normalizes line endings and whitespace and counts Unicode code points', () => {
    expect(normalizeRatingReview('  primera\r\nsegunda\rtercera  ')).toBe(
      'primera\nsegunda\ntercera',
    );
    expect(normalizeRatingReview(' \n\t ')).toBeNull();
    expect(ratingReviewLength('🙂e\u0301')).toBe(3);
    expect(ratingReviewLength('🙂'.repeat(2_000))).toBe(2_000);
    expect(ratingReviewLength('🙂'.repeat(2_001))).toBe(2_001);
  });

  it('rejects NUL and malformed surrogate values', () => {
    expect(isValidRatingReview('texto válido 🙂')).toBe(true);
    expect(isValidRatingReview('texto\0inválido')).toBe(false);
    expect(isValidRatingReview('\ud800')).toBe(false);
    expect(isValidRatingReview('\udc00')).toBe(false);
  });
});
