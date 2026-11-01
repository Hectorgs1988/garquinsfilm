import { describe, expect, it } from 'vitest';
import {
  SeasonProgressValidationError,
  parseSeasonNumberParam,
  validateSeasonProgressBatch,
  validateSeasonProgressEntryId,
} from './season-progress.validation.js';

describe('season number path parameter', () => {
  it.each(['0', '1', '10', '9999'])('accepts %s', (value) => {
    expect(parseSeasonNumberParam(value)).toBe(Number(value));
  });

  it.each([
    '-1',
    '-0',
    '+1',
    '01',
    '00',
    '1.0',
    '1.5',
    '1e2',
    '0x10',
    '10000',
    '',
    ' 1',
    '1 ',
    'a',
  ])('rejects %j', (value) => {
    expect(() => parseSeasonNumberParam(value)).toThrow(SeasonProgressValidationError);
  });

  it('rejects non-string values', () => {
    expect(() => parseSeasonNumberParam(1)).toThrow(SeasonProgressValidationError);
    expect(() => parseSeasonNumberParam(undefined)).toThrow(SeasonProgressValidationError);
  });
});

describe('entry id', () => {
  it('requires a non-empty string of at most 128 characters', () => {
    expect(validateSeasonProgressEntryId('entry')).toBe('entry');
    expect(() => validateSeasonProgressEntryId('')).toThrow(SeasonProgressValidationError);
    expect(() => validateSeasonProgressEntryId('a'.repeat(129))).toThrow(
      SeasonProgressValidationError,
    );
    expect(() => validateSeasonProgressEntryId(1)).toThrow(SeasonProgressValidationError);
  });
});

describe('season batch validation', () => {
  it('accepts boundaries and either list on its own', () => {
    expect(validateSeasonProgressBatch({ complete: [0, 9999] })).toEqual({
      complete: [0, 9999],
      uncomplete: [],
    });
    expect(validateSeasonProgressBatch({ uncomplete: [3] })).toEqual({
      complete: [],
      uncomplete: [3],
    });
    expect(validateSeasonProgressBatch({ complete: [1, 2], uncomplete: [3] })).toEqual({
      complete: [1, 2],
      uncomplete: [3],
    });
  });

  it('normalises negative zero', () => {
    const result = validateSeasonProgressBatch({ complete: [-0] });
    expect(Object.is(result.complete[0], 0)).toBe(true);
  });

  it('accepts exactly 100 operations in total and rejects 101', () => {
    const numbers = Array.from({ length: 101 }, (_, index) => index);
    expect(
      validateSeasonProgressBatch({
        complete: numbers.slice(0, 60),
        uncomplete: numbers.slice(60, 100),
      }),
    ).toBeDefined();
    expect(() =>
      validateSeasonProgressBatch({
        complete: numbers.slice(0, 60),
        uncomplete: numbers.slice(60),
      }),
    ).toThrow(SeasonProgressValidationError);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
    ['an empty object', {}],
    ['empty lists', { complete: [], uncomplete: [] }],
    ['an empty list only', { complete: [] }],
    ['unknown properties', { complete: [1], userId: 'other' }],
    ['a client completedAt', { complete: [1], completedAt: '2026-01-01T00:00:00.000Z' }],
    ['null lists', { complete: null }],
    ['a non-array list', { complete: 1 }],
    ['string numbers', { complete: ['1'] }],
    ['negative numbers', { complete: [-1] }],
    ['decimals', { complete: [1.5] }],
    ['numbers above the maximum', { uncomplete: [10000] }],
    ['NaN-like values', { complete: [Number.NaN] }],
    ['infinite values', { complete: [Number.POSITIVE_INFINITY] }],
    ['duplicates within complete', { complete: [1, 1] }],
    ['duplicates within uncomplete', { uncomplete: [2, 2] }],
    ['overlap between lists', { complete: [1, 2], uncomplete: [2] }],
  ])('rejects %s', (_label, value) => {
    expect(() => validateSeasonProgressBatch(value)).toThrow(SeasonProgressValidationError);
  });
});
