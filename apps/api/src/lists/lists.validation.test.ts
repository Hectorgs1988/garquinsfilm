import { describe, expect, it } from 'vitest';
import {
  normalizeListDescription,
  normalizeListName,
  validateListCreateInput,
  validateListId,
  validateListUpdateInput,
} from './lists.validation.js';

const invalid = 'List input is invalid.';
const stamp = '2026-11-15T10:00:00.000Z';

describe('list name', () => {
  it('trims and normalizes to NFC', () => {
    expect(normalizeListName('  Cine de los 90  ')).toBe('Cine de los 90');
    expect(normalizeListName('José')).toBe('José');
  });

  it('accepts 80 characters and rejects 81', () => {
    expect(normalizeListName('x'.repeat(80))).toHaveLength(80);
    expect(() => normalizeListName('x'.repeat(81))).toThrow(invalid);
  });

  it('counts emoji as one character', () => {
    expect(normalizeListName('🎬'.repeat(80))).toBeTruthy();
    expect(() => normalizeListName('🎬'.repeat(81))).toThrow(invalid);
  });

  it.each(['', '   ', 'Lista\nrota', 'Lista\u0000', 42, null])('rejects %j', (value) => {
    expect(() => normalizeListName(value)).toThrow(invalid);
  });
});

describe('list description', () => {
  it('treats blank text as absent', () => {
    expect(normalizeListDescription(null)).toBeNull();
    expect(normalizeListDescription('   ')).toBeNull();
  });

  it('keeps line breaks and normalizes CRLF', () => {
    expect(normalizeListDescription('Una\r\nlista')).toBe('Una\nlista');
  });

  it('accepts 300 characters and rejects 301', () => {
    expect(normalizeListDescription('ñ'.repeat(300))).toHaveLength(300);
    expect(() => normalizeListDescription('ñ'.repeat(301))).toThrow(invalid);
  });
});

describe('create input', () => {
  it('accepts a name alone', () => {
    expect(validateListCreateInput({ name: ' Pendientes ' })).toEqual({ name: 'Pendientes' });
  });

  it('accepts name and description', () => {
    expect(validateListCreateInput({ name: 'Cine', description: ' Clásicos ' })).toEqual({
      name: 'Cine',
      description: 'Clásicos',
    });
  });

  it.each([{}, { description: 'Sin nombre' }, { name: 'Cine', ownerId: 'otro' }, null, []])(
    'rejects %j',
    (value) => {
      expect(() => validateListCreateInput(value)).toThrow(invalid);
    },
  );
});

describe('update input', () => {
  it('requires the version the client saw', () => {
    expect(() => validateListUpdateInput({ name: 'Cine' })).toThrow(invalid);
  });

  it('requires something to change besides the version', () => {
    expect(() => validateListUpdateInput({ expectedUpdatedAt: stamp })).toThrow(invalid);
  });

  it('normalizes the timestamp it receives', () => {
    expect(
      validateListUpdateInput({ name: 'Cine', expectedUpdatedAt: '2026-11-15T11:00:00+01:00' }),
    ).toEqual({ name: 'Cine', expectedUpdatedAt: stamp });
  });

  it('allows clearing the description', () => {
    expect(validateListUpdateInput({ description: null, expectedUpdatedAt: stamp })).toEqual({
      description: null,
      expectedUpdatedAt: stamp,
    });
  });

  it.each([
    { name: 'Cine', expectedUpdatedAt: 'ayer' },
    { name: 'Cine', expectedUpdatedAt: stamp, ownerId: 'otro' },
    { name: '   ', expectedUpdatedAt: stamp },
  ])('rejects %j', (value) => {
    expect(() => validateListUpdateInput(value)).toThrow(invalid);
  });
});

describe('list id', () => {
  it('accepts a uuid', () => {
    const id = '0b5f5d2e-39b1-4c4b-9f3c-2f3a1b7d9c11';
    expect(validateListId(id)).toBe(id);
  });

  it.each(['', ' ', 'a'.repeat(65), '../../etc/passwd', 'id with spaces', 7, null])(
    'rejects %j',
    (value) => {
      expect(() => validateListId(value)).toThrow(invalid);
    },
  );
});
