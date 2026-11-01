import { describe, expect, it } from 'vitest';
import { scoreToTenths, validateRatingPutInput } from './ratings.validation.js';

describe('rating input validation', () => {
  it.each(Array.from({ length: 101 }, (_, tenths) => tenths / 10))(
    'accepts score %s on the 0.1 scale',
    (score) => {
      expect(
        validateRatingPutInput({
          score,
          review: null,
          containsSpoilers: false,
        }),
      ).toEqual({ score, review: null, containsSpoilers: false });
    },
  );

  it.each(Array.from({ length: 101 }, (_, tenths) => tenths))(
    'converts tenths value %s without rounding',
    (tenths) => {
      expect(scoreToTenths(tenths / 10)).toBe(tenths);
    },
  );

  it.each([-0.1, 10.1, 7.85, Number.NaN, Number.POSITIVE_INFINITY, '8'])(
    'rejects invalid score %s',
    (score) => {
      expect(() =>
        validateRatingPutInput({
          score,
          review: null,
          containsSpoilers: false,
        }),
      ).toThrow('Rating input is invalid.');
    },
  );

  it('distinguishes score zero from an absent score and allows review-only ratings', () => {
    expect(
      validateRatingPutInput({
        score: 0,
        review: null,
        containsSpoilers: false,
      }).score,
    ).toBe(0);
    expect(
      validateRatingPutInput({
        score: null,
        review: 'Only a review',
        containsSpoilers: false,
      }),
    ).toMatchObject({ score: null, review: 'Only a review' });
  });

  it('normalizes whitespace and line endings before measuring Unicode code points', () => {
    const review = validateRatingPutInput({
      score: null,
      review: '  primera\r\nsegunda\rtercera  ',
      containsSpoilers: true,
    });
    expect(review.review).toBe('primera\nsegunda\ntercera');
    expect(review.containsSpoilers).toBe(true);

    expect(() =>
      validateRatingPutInput({
        score: null,
        review: '😀'.repeat(2_001),
        containsSpoilers: false,
      }),
    ).toThrow('Rating input is invalid.');
    expect(
      validateRatingPutInput({
        score: null,
        review: '😀'.repeat(2_000),
        containsSpoilers: false,
      }).review,
    ).toHaveLength(4_000);
    const combiningCharactersReview = validateRatingPutInput({
      score: null,
      review: 'e\u0301'.repeat(1_000),
      containsSpoilers: false,
    }).review;
    expect(combiningCharactersReview).toHaveLength(2_000);
    expect([...combiningCharactersReview!]).toHaveLength(2_000);
  });

  it('treats whitespace-only reviews as absent and requires score or review', () => {
    expect(
      validateRatingPutInput({
        score: 8,
        review: ' \t\r\n ',
        containsSpoilers: false,
      }),
    ).toMatchObject({ score: 8, review: null, containsSpoilers: false });

    expect(() =>
      validateRatingPutInput({
        score: null,
        review: ' \t\r\n ',
        containsSpoilers: false,
      }),
    ).toThrow('Rating input is invalid.');
  });

  it('requires spoilers to have a nonempty review and rejects unsafe/unknown values', () => {
    for (const input of [
      { score: 8, review: null, containsSpoilers: true },
      { score: 8, review: 'review', containsSpoilers: false, userId: 'other' },
      { score: 8, review: 'review' },
      { score: null, review: 'review\u0000', containsSpoilers: false },
      { score: null, review: '\ud800', containsSpoilers: false },
    ]) {
      expect(() => validateRatingPutInput(input)).toThrow('Rating input is invalid.');
    }

    expect(() =>
      validateRatingPutInput({
        score: null,
        review: null,
        containsSpoilers: false,
      }),
    ).toThrow('Rating input is invalid.');
  });
});
