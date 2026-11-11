import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
  type ProfileUpdateInput,
} from '@garquinsfilm/shared';

const inputKeys = new Set(['name', 'bio']);
// Caracteres de control C0/C1: el nombre no admite ninguno; la biografía admite \t y \n.
const NO_CONTROL_ALLOWED = new Set<number>();
const BIO_ALLOWED_CONTROLS = new Set([0x09, 0x0a]);

export class ProfileValidationError extends Error {
  constructor() {
    super('Profile input is invalid.');
    this.name = 'ProfileValidationError';
  }
}

export function validateProfileUpdateInput(value: unknown): ProfileUpdateInput {
  if (!isRecord(value)) throw new ProfileValidationError();

  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !inputKeys.has(key))) {
    throw new ProfileValidationError();
  }

  const input: ProfileUpdateInput = {};
  if (Object.hasOwn(value, 'name')) input.name = normalizeProfileName(value.name);
  if (Object.hasOwn(value, 'bio')) input.bio = normalizeProfileBio(value.bio);
  return input;
}

export function normalizeProfileName(value: unknown): string {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
    throw new ProfileValidationError();
  }
  const normalized = value.normalize('NFC').trim();
  const length = codePointLength(normalized);
  if (
    length < 1 ||
    length > PROFILE_NAME_MAX_LENGTH ||
    hasControlChars(normalized, NO_CONTROL_ALLOWED)
  ) {
    throw new ProfileValidationError();
  }
  return normalized;
}

export function normalizeProfileBio(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
    throw new ProfileValidationError();
  }
  const normalized = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return null;
  if (
    codePointLength(normalized) > PROFILE_BIO_MAX_LENGTH ||
    hasControlChars(normalized, BIO_ALLOWED_CONTROLS)
  ) {
    throw new ProfileValidationError();
  }
  return normalized;
}

function hasControlChars(value: string, allowed: ReadonlySet<number>): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    if (isControl && !allowed.has(code)) return true;
  }
  return false;
}

function codePointLength(value: string): number {
  return [...value].length;
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
