import { getDatabaseUrl } from '../db/connection-url.js';
import { getPrismaClient } from '../db/client.js';
import { bootstrapFirstAdmin } from '../auth/bootstrap.service.js';
import {
  assertLocalOnlyOperation,
  assertSameLocalDatabase,
  requestLocalConfirmation,
} from '../auth/local-only.js';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const name = process.env.BOOTSTRAP_ADMIN_NAME;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!email || !name || !password) {
  throw new Error('Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, and BOOTSTRAP_ADMIN_PASSWORD.');
}

const prisma = getPrismaClient();
try {
  const databaseUrl = getDatabaseUrl();
  const identity = await assertLocalOnlyOperation({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl,
    allowedDatabaseIdentities: process.env.LOCAL_AUTH_ALLOWED_DATABASES,
    prisma,
  });
  await requestLocalConfirmation('bootstrap-first-admin', identity);
  const user = await bootstrapFirstAdmin(
    prisma,
    {
      email,
      name,
      password,
    },
    async () => {
      const revalidatedIdentity = await assertLocalOnlyOperation({
        nodeEnv: process.env.NODE_ENV,
        databaseUrl,
        allowedDatabaseIdentities: process.env.LOCAL_AUTH_ALLOWED_DATABASES,
        prisma,
      });
      assertSameLocalDatabase(identity, revalidatedIdentity);
    },
  );
  process.stdout.write(`Initial administrator created (${user.id}).\n`);
} finally {
  await prisma.$disconnect();
}
