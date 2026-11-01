import { describe, expect, it } from 'vitest';
import type { SeasonProgressItem, TvSeason } from '@garquinsfilm/shared';

import { calculateSeasonProgress, planMarkUpTo, toIsoDate } from './season-progress.js';

const TODAY = '2026-06-01';

function season(seasonNumber: number, overrides: Partial<TvSeason> = {}): TvSeason {
  return {
    seasonNumber,
    name: `Temporada ${seasonNumber}`,
    episodeCount: 8,
    airDate: '2020-01-01',
    posterUrl: null,
    isSpecial: seasonNumber === 0,
    ...overrides,
  };
}

const done = (...numbers: number[]): SeasonProgressItem[] =>
  numbers.map((seasonNumber) => ({ seasonNumber, completedAt: '2026-01-01T00:00:00.000Z' }));

describe('calculateSeasonProgress', () => {
  it('returns 0% with nothing completed and 100% with everything completed', () => {
    const seasons = [season(1), season(2)];
    expect(calculateSeasonProgress(seasons, [], TODAY).percent).toBe(0);
    const all = calculateSeasonProgress(seasons, done(1, 2), TODAY);
    expect(all.percent).toBe(100);
    expect(all.allEligibleCompleted).toBe(true);
  });

  it('excludes specials from the percentage but lists them separately', () => {
    const summary = calculateSeasonProgress([season(0), season(1)], done(0), TODAY);
    expect(summary.percent).toBe(0);
    expect(summary.specials?.completed).toBe(true);
    expect(summary.regular).toHaveLength(1);
  });

  it('keeps specials that only exist in the backend', () => {
    const summary = calculateSeasonProgress([season(1)], done(0), TODAY);
    expect(summary.specials?.completed).toBe(true);
    expect(summary.orphans).toEqual([]);
  });

  it('excludes future seasons and marks them upcoming', () => {
    const summary = calculateSeasonProgress(
      [season(1), season(2, { airDate: '2026-06-02' })],
      done(1),
      TODAY,
    );
    expect(summary.percent).toBe(100);
    expect(summary.hasUpcoming).toBe(true);
    expect(summary.regular[1]?.upcoming).toBe(true);
  });

  it('counts a null air date with known episodes', () => {
    const summary = calculateSeasonProgress([season(1, { airDate: null })], [], TODAY);
    expect(summary.eligibleTotal).toBe(1);
  });

  it('ignores seasons without episodes in the denominator', () => {
    const summary = calculateSeasonProgress(
      [season(1), season(2, { episodeCount: 0 })],
      done(1, 2),
      TODAY,
    );
    expect(summary.eligibleTotal).toBe(1);
    expect(summary.percent).toBe(100);
  });

  it('handles non-consecutive season numbers', () => {
    const summary = calculateSeasonProgress([season(2), season(5)], done(5), TODAY);
    expect(summary.percent).toBe(50);
  });

  it('reports orphans outside the percentage and never exceeds 100', () => {
    const summary = calculateSeasonProgress([season(1)], done(1, 7, 3), TODAY);
    expect(summary.orphans).toEqual([3, 7]);
    expect(summary.percent).toBe(100);
  });

  it('is indeterminate without metadata and lists completed seasons', () => {
    const summary = calculateSeasonProgress(null, done(2, 1), TODAY);
    expect(summary.percent).toBeNull();
    expect(summary.hasMetadata).toBe(false);
    expect(summary.orphans).toEqual([1, 2]);
    expect(summary.completedCount).toBe(2);
  });

  it('formats local dates as YYYY-MM-DD', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('planMarkUpTo', () => {
  it('selects only pending eligible seasons up to the target', () => {
    const summary = calculateSeasonProgress(
      [season(1), season(2), season(3), season(4, { airDate: '2030-01-01' })],
      done(1),
      TODAY,
    );
    expect(planMarkUpTo(summary, 3)).toEqual({ kind: 'ok', seasonNumbers: [2, 3] });
    expect(planMarkUpTo(summary, 1)).toEqual({ kind: 'nothing' });
  });

  it('refuses to split more than 100 seasons into several batches', () => {
    const seasons = Array.from({ length: 101 }, (_, index) => season(index + 1));
    const summary = calculateSeasonProgress(seasons, [], TODAY);
    expect(planMarkUpTo(summary, 101)).toEqual({ kind: 'too_many', count: 101 });
    expect(planMarkUpTo(summary, 100).kind).toBe('ok');
  });
});
