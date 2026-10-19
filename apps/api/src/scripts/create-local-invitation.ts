import { getDatabaseUrl } from '../db/connection-url.js';
import { getPrismaClient } from '../db/client.js';
import { createInvitation, normalizeEmail } from '../auth/invitations.service.js';
import {
  assertLocalOnlyOperation,
  assertSameLocalDatabase,
  requestLocalConfirmation,
} from '../auth/local-only.js';
import { USER_ROLES } from '../auth/roles.js';

const recipientEmail = process.env.LOCAL_INVITATION_EMAIL;
const adminEmail = process.env.LOCAL_INVITATION_ADMIN_EMAIL;
const databaseUrl = getDatabaseUrl();

if (!recipientEmail || !adminEmail) {
  throw new Error('Set LOCAL_INVITATION_EMAIL and LOCAL_INVITATION_ADMIN_EMAIL.');
}

const prisma = getPrismaClient();
try {
  const identity = await assertLocalOnlyOperation({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl,
    allowedDatabaseIdentities: process.env.LOCAL_AUTH_ALLOWED_DATABASES,
    prisma,
  });
  await requestLocalConfirmation('issue-local-invitation', identity);
  const admin = await prisma.user.findUnique({
    where: { email: normalizeEmail(adminEmail) },
    select: { id: true, role: true },
  });
  if (!admin || admin.role !== USER_ROLES.admin) {
    throw new Error('The configured local issuer is not an administrator.');
  }

  const revalidatedIdentity = await assertLocalOnlyOperation({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl,
    allowedDatabaseIdentities: process.env.LOCAL_AUTH_ALLOWED_DATABASES,
    prisma,
  });
  assertSameLocalDatabase(identity, revalidatedIdentity);

  await createInvitation(
    prisma,
    { email: recipientEmail, createdByUserId: admin.id },
    {
      async deliver(invitation) {
        await new Promise<void>((resolve, reject) => {
          process.stdout.write(
            `Local test invitation token (show once; do not share): ${invitation.token}\n`,
            (error) => (error ? reject(error) : resolve()),
          );
        });
      },
    },
  );
} finally {
  await prisma.$disconnect();
}
