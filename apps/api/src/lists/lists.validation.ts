import {
  LIST_DESCRIPTION_MAX_LENGTH,
  LIST_NAME_MAX_LENGTH,
  type MediaListCreateInput,
  type MediaListUpdateInput,
} from '@garquinsfilm/shared';

const createKeys = new Set(['name', 'description']);
const updateKeys = new Set(['name', 'description', 'expectedUpdatedAt']);

export class ListValidationError extends Error {
  constructor() {
    super('List input is invalid.');
    this.name = 'ListValidationError';
  }
}

export function validateListCreateInput(value: unknown): MediaListCreateInput {
  if (!isRecord(value)) throw new ListValidationError();
  const keys = Object.keys(value);
  if (keys.some((key) => !createKeys.has(key))) throw new ListValidationError();

  const input: MediaListCreateInput = { name: normalizeListName(value.name) };
  if (Object.hasOwn(value, 'description')) {
    input.description = normalizeListDescription(value.description);
  }
  return input;
}

export function validateListUpdateInput(value: unknown): MediaListUpdateInput {
  if (!isRecord(value)) throw new ListValidationError();
  const keys = Object.keys(value);
  if (keys.some((key) => !updateKeys.has(key))) throw new ListValidationError();
  // Sin una marca de versión no se puede detectar una edición simultánea.
  if (!Object.hasOwn(value, 'expectedUpdatedAt')) throw new ListValidationError();
  if (!keys.some((key) => key === 'name' || key === 'description')) {
    throw new ListValidationError();
  }

  const input: MediaListUpdateInput = {
    expectedUpdatedAt: normalizeTimestamp(value.expectedUpdatedAt),
  };
  if (Object.hasOwn(value, 'name')) input.name = normalizeListName(value.name);
  if (Object.hasOwn(value, 'description')) {
    input.description = normalizeListDescription(value.description);
  }
  return input;
}

export function normalizeListName(value: unknown): string {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) throw new ListValidationError();
  const normalized = value.normalize('NFC').trim();
  const length = [...normalized].length;
  if (length < 1 || length > LIST_NAME_MAX_LENGTH || hasControlChars(normalized, new Set())) {
    throw new ListValidationError();
  }
  return normalized;
}

export function normalizeListDescription(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) throw new ListValidationError();
  const normalized = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return null;
  if (
    [...normalized].length > LIST_DESCRIPTION_MAX_LENGTH ||
    hasControlChars(normalized, new Set([0x09, 0x0a]))
  ) {
    throw new ListValidationError();
  }
  return normalized;
}

export function validateListId(value: unknown): string {
  if (typeof value !== 'string') throw new ListValidationError();
  const id = value.trim();
  if (id.length < 1 || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new ListValidationError();
  }
  return id;
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value !== 'string') throw new ListValidationError();
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new ListValidationError();
  return new Date(parsed).toISOString();
}

function hasControlChars(value: string, allowed: ReadonlySet<number>): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    if (isControl && !allowed.has(code)) return true;
  }
  return false;
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
