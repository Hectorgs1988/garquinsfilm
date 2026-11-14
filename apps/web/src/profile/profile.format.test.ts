import { describe, expect, it } from 'vitest';
import {
  getInitials,
  normalizeBioInput,
  normalizeNameInput,
  textLength,
} from './profile.format.js';

describe('avatar initials', () => {
  it.each([
    ['Héctor García', 'HG'],
    ['Ana', 'A'],
    ['ana maría lópez pérez', 'AM'],
    ['  Ada  Lovelace  ', 'AL'],
  ])('builds initials for %j', (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });

  it('falls back to the email local part when there is no name', () => {
    expect(getInitials('', 'ada.lovelace@example.test')).toBe('AL');
    expect(getInitials('   ', 'postman@example.test')).toBe('P');
  });

  it('never returns an empty label', () => {
    expect(getInitials('', '')).toBe('·');
  });

  it('keeps a whole emoji instead of half a surrogate pair', () => {
    expect(getInitials('🎬 Cine')).toBe('🎬C');
  });
});

describe('text length and normalization', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(textLength('🎬🎬')).toBe(2);
    expect(textLength('ñ'.repeat(300))).toBe(300);
  });

  it('counts CRLF as a single character, like the API', () => {
    expect(textLength('a\r\nb')).toBe(3);
  });

  it('trims the name and turns an empty bio into null', () => {
    expect(normalizeNameInput('  Ana  ')).toBe('Ana');
    expect(normalizeBioInput('  Hola  ')).toBe('Hola');
    expect(normalizeBioInput('   ')).toBeNull();
    expect(normalizeBioInput('')).toBeNull();
  });

  it('normalizes line endings in the bio', () => {
    expect(normalizeBioInput('Hola\r\nmundo')).toBe('Hola\nmundo');
  });
});
