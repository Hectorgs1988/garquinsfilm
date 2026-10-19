import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../generated/prisma/client.js';

const { operations, createCredentialUser, hashCredentialPassword, validatePassword } = vi.hoisted(
  () => ({
    operations: [] as string[],
    createCredentialUser: vi.fn(),
    hashCredentialPassword: vi.fn(),
    validatePassword: vi.fn(),
  }),
);

vi.mock('./users.service.js', () => ({
  createCredentialUser,
  hashCredentialPassword,
  validatePassword,
}));

import { bootstrapFirstAdmin } from './bootstrap.service.js';

describe('bootstrapFirstAdmin', () => {
  beforeEach(() => {
    operations.length = 0;
    validatePassword.mockImplementation(() => {
      operations.push('validate-password');
    });
    hashCredentialPassword.mockImplementation(async () => {
      operations.push('hash-password');
      return 'password-hash';
    });
    createCredentialUser.mockImplementation(async () => {
      operations.push('write-user');
      return { id: 'admin-id', email: 'admin@example.test', role: 'admin' };
    });
  });

  it('validates the destination after hashing and immediately before opening the transaction', async () => {
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        operations.push('begin-transaction');
        return callback(tx);
      }),
    } as unknown as PrismaClient;

    await bootstrapFirstAdmin(
      prisma,
      {
        email: 'admin@example.test',
        name: 'Administrator',
        password: 'valid-password-123',
      },
      async () => {
        operations.push('validate-destination');
      },
    );

    expect(operations).toEqual([
      'validate-password',
      'hash-password',
      'validate-destination',
      'begin-transaction',
      'write-user',
    ]);
  });

  it('does not open a transaction when the final destination validation fails', async () => {
    const prisma = {
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    await expect(
      bootstrapFirstAdmin(
        prisma,
        {
          email: 'admin@example.test',
          name: 'Administrator',
          password: 'valid-password-123',
        },
        async () => {
          throw new Error('The PostgreSQL destination changed before bootstrap.');
        },
      ),
    ).rejects.toThrow('The PostgreSQL destination changed before bootstrap.');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
