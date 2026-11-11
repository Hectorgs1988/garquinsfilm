import { describe, expect, it } from 'vitest';
import {
  normalizeProfileBio,
  normalizeProfileName,
  validateProfileUpdateInput,
} from './profile.validation.js';

const invalid = 'Profile input is invalid.';

describe('profile name validation', () => {
  it('trims and returns valid names', () => {
    expect(normalizeProfileName('  Héctor  ')).toBe('Héctor');
    expect(normalizeProfileName('a')).toBe('a');
  });

  it('normalizes to NFC so equivalent names are stored identically', () => {
    const decomposed = 'Jose\u0301';
    expect(normalizeProfileName(decomposed)).toBe('José');
  });

  it('counts Unicode code points, not UTF-16 units', () => {
    expect(normalizeProfileName('🎬'.repeat(50))).toBe('🎬'.repeat(50));
    expect(() => normalizeProfileName('🎬'.repeat(51))).toThrow(invalid);
  });

  it('accepts 50 characters and rejects 51', () => {
    expect(normalizeProfileName('x'.repeat(50))).toHaveLength(50);
    expect(() => normalizeProfileName('x'.repeat(51))).toThrow(invalid);
  });

  it.each(['', '   ', 'Ana\nLópez', 'Ana\tLópez', 'Ana\u0000', 'Ana\u007f', '\ud800', 123, null])(
    'rejects invalid name %j',
    (value) => {
      expect(() => normalizeProfileName(value)).toThrow(invalid);
    },
  );
});

describe('profile bio validation', () => {
  it('normalizes line endings and trims', () => {
    expect(normalizeProfileBio('  Hola\r\nmundo\rfin  ')).toBe('Hola\nmundo\nfin');
  });

  it('treats null, empty and whitespace-only bios as null', () => {
    expect(normalizeProfileBio(null)).toBeNull();
    expect(normalizeProfileBio('')).toBeNull();
    expect(normalizeProfileBio(' \n\t ')).toBeNull();
  });

  it('accepts 300 code points and rejects 301', () => {
    expect(normalizeProfileBio('ñ'.repeat(300))).toHaveLength(300);
    expect(() => normalizeProfileBio('ñ'.repeat(301))).toThrow(invalid);
  });

  it('allows tabs and line breaks inside the bio', () => {
    expect(normalizeProfileBio('Cine\tseries\nanimación')).toBe('Cine\tseries\nanimación');
  });

  it.each(['Hola\u0000', 'Hola\u001b[31m', 'Hola\u0085', '\udc00', 42, {}])(
    'rejects invalid bio %j',
    (value) => {
      expect(() => normalizeProfileBio(value)).toThrow(invalid);
    },
  );
});

describe('profile update input', () => {
  it('accepts partial updates', () => {
    expect(validateProfileUpdateInput({ name: ' Ana ' })).toEqual({ name: 'Ana' });
    expect(validateProfileUpdateInput({ bio: null })).toEqual({ bio: null });
    expect(validateProfileUpdateInput({ name: 'Ana', bio: ' Cine ' })).toEqual({
      name: 'Ana',
      bio: 'Cine',
    });
  });

  it.each([
    {},
    null,
    [],
    'name',
    { email: 'otro@example.test' },
    { name: 'Ana', role: 'admin' },
    { avatarKind: 'preset' },
    { name: 'Ana', image: 'https://example.com/a.png' },
  ])('rejects %j', (value) => {
    expect(() => validateProfileUpdateInput(value)).toThrow(invalid);
  });
});
