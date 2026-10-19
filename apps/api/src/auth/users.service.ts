import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import { auth } from './auth.js';
import { USER_ROLES, type UserRole } from './roles.js';

export async function hashCredentialPassword(password: string): Promise<string> {
  const context = await auth.$context;
  return context.password.hash(password);
}

export function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 128) {
    throw new Error('Password must be between 12 and 128 characters.');
  }
}

export async function createCredentialUser(
  tx: Prisma.TransactionClient,
  input: {
    email: string;
    name: string;
    passwordHash: string;
    role: UserRole;
    emailVerified: boolean;
  },
): Promise<{ id: string; name: string; email: string; role: string }> {
  if (input.role !== USER_ROLES.user && input.role !== USER_ROLES.admin) {
    throw new Error('Unsupported global user role.');
  }
  const user = await tx.user.create({
    data: {
      id: randomUUID(),
      email: input.email,
      name: input.name,
      role: input.role,
      emailVerified: input.emailVerified,
    },
    select: { id: true, name: true, email: true, role: true },
  });
  await tx.account.create({
    data: {
      id: randomUUID(),
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: input.passwordHash,
    },
  });
  return user;
}
