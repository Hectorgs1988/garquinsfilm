import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { USER_ROLES } from './roles.js';
import { createCredentialUser, hashCredentialPassword, validatePassword } from './users.service.js';
import { normalizeEmail } from './invitations.service.js';

export class AdminAlreadyBootstrappedError extends Error {
  constructor(options?: ErrorOptions) {
    super('An administrator already exists.', options);
    this.name = 'AdminAlreadyBootstrappedError';
  }
}

export async function bootstrapFirstAdmin(
  prisma: PrismaClient,
  input: {
    email: string;
    name: string;
    password: string;
  },
  beforeTransaction: () => Promise<void>,
): Promise<{ id: string; email: string; role: string }> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!name || name.length > 128) {
    throw new Error('A display name between 1 and 128 characters is required.');
  }
  validatePassword(input.password);
  const passwordHash = await hashCredentialPassword(input.password);
  await beforeTransaction();

  try {
    return await prisma.$transaction(
      async (tx) => {
        const existingAdmin = await tx.user.findFirst({ where: { role: USER_ROLES.admin } });
        if (existingAdmin) {
          throw new AdminAlreadyBootstrappedError();
        }

        const user = await createCredentialUser(tx, {
          email,
          name,
          passwordHash,
          role: USER_ROLES.admin,
          emailVerified: true,
        });
        await tx.auditEvent.create({
          data: {
            action: 'auth.bootstrap_admin',
            actorUserId: user.id,
            targetId: user.id,
          },
        });
        return { id: user.id, email: user.email, role: user.role };
      },
      { isolationLevel: 'Serializable' },
    );
  } catch (error) {
    if (isBootstrapConcurrencyConflict(error)) {
      throw new AdminAlreadyBootstrappedError({ cause: error });
    }
    throw error;
  }
}

function isBootstrapConcurrencyConflict(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Prisma.PrismaClientKnownRequestError && current.code === 'P2034') {
      return true;
    }
    if (typeof current !== 'object') {
      return false;
    }
    const candidate = current as Record<string, unknown>;
    if (
      candidate.code === '40001' ||
      candidate.kind === 'TransactionWriteConflict' ||
      candidate.message === 'TransactionWriteConflict'
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}
