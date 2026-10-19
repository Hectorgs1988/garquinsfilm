import { describe, expect, it } from 'vitest';
import {
  hashInvitationToken,
  INVITATION_LIFETIME_MS,
  normalizeEmail,
} from './invitations.service.js';

describe('invitation primitives', () => {
  it('normalizes email addresses consistently and rejects invalid addresses', () => {
    expect(normalizeEmail('  User@Example.test ')).toBe('user@example.test');
    expect(() => normalizeEmail('not-an-email')).toThrow('input is invalid');
  });

  it('hashes the raw invitation token and uses a seven-day lifetime', () => {
    const token = 'high-entropy-test-token';
    const hash = hashInvitationToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(INVITATION_LIFETIME_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
