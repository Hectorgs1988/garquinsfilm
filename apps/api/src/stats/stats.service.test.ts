import { describe, expect, it } from 'vitest';
import { toScore } from './stats.service.js';

describe('average score conversion', () => {
  it('returns null when there are no scores', () => {
    expect(toScore(null)).toBeNull();
  });

  it('keeps zero as a real average, not as an absent one', () => {
    expect(toScore(0)).toBe(0);
  });

  it.each([
    [85, 8.5],
    [83.3333333, 8.3],
    [86.6666666, 8.7],
    [100, 10],
    [7, 0.7],
  ])('converts %s tenths into %s', (tenths, expected) => {
    expect(toScore(tenths)).toBe(expected);
  });

  it('never returns more than one decimal', () => {
    for (let tenths = 0; tenths <= 1000; tenths += 1) {
      const score = toScore(tenths / 3);
      expect(score).not.toBeNull();
      expect(Number.isInteger((score as number) * 10)).toBe(true);
    }
  });

  it('ignores values that are not finite', () => {
    expect(toScore(Number.NaN)).toBeNull();
    expect(toScore(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
