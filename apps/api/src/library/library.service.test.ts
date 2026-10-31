import { describe, expect, it } from 'vitest';
import { resolveCompletedAt } from './library.service.js';

describe('library completion timestamps', () => {
  const completedAt = new Date('2026-01-01T10:00:00.000Z');
  const now = new Date('2026-02-01T10:00:00.000Z');

  it('sets the completion time when entering COMPLETED', () => {
    expect(resolveCompletedAt('WATCHING', null, 'COMPLETED', now)).toBe(now);
    expect(resolveCompletedAt('PENDING', null, 'COMPLETED', now)).toBe(now);
  });

  it('preserves the timestamp when remaining COMPLETED', () => {
    expect(resolveCompletedAt('COMPLETED', completedAt, 'COMPLETED', now)).toBe(completedAt);
  });

  it('clears the timestamp when leaving COMPLETED and records a new one on re-completion', () => {
    expect(resolveCompletedAt('COMPLETED', completedAt, 'WATCHING', now)).toBeNull();
    expect(resolveCompletedAt('WATCHING', null, 'COMPLETED', now)).toBe(now);
  });
});
