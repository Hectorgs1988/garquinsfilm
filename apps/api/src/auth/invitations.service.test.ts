import { describe, expect, it, vi } from 'vitest';
import {
  acceptInvitation,
  hashInvitationToken,
  INVITATION_LIFETIME_MS,
  InvalidInvitationInputError,
  normalizeEmail,
} from './invitations.service.js';
import type { PrismaClient } from '../generated/prisma/client.js';

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

describe('acceptInvitation display name', () => {
  it.each(['x'.repeat(51), '   ', 'Ana\nLópez'])(
    'rejects invalid display name %j before touching the database',
    async (name) => {
      const prisma = { $transaction: vi.fn() } as unknown as PrismaClient;

      await expect(
        acceptInvitation(prisma, {
          email: 'user@example.test',
          name,
          password: 'valid-password-123',
          token: 't'.repeat(43),
        }),
      ).rejects.toBeInstanceOf(InvalidInvitationInputError);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
