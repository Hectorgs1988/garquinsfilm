import { createHash, randomBytes } from 'node:crypto';
import { InvitationStatus, type PrismaClient } from '../generated/prisma/client.js';
import { USER_ROLES } from './roles.js';
import { createCredentialUser, hashCredentialPassword, validatePassword } from './users.service.js';

export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export interface InvitationDelivery {
  // Resolve only after SMTP accepts the recipient; this does not guarantee final mailbox delivery.
  deliver(invitation: { id: string; email: string; token: string; expiresAt: Date }): Promise<void>;
}

export class InvitationDeliveryUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('Invitation delivery is not configured.', options);
    this.name = 'InvitationDeliveryUnavailableError';
  }
}

export class InvitationActivationUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('Invitation delivery was accepted, but the invitation remains inactive.', options);
    this.name = 'InvitationActivationUnavailableError';
  }
}

export class InvitationActivationConflictError extends Error {
  constructor() {
    super('The invitation could not be activated because its state changed.');
    this.name = 'InvitationActivationConflictError';
  }
}

export class InvalidInvitationError extends Error {
  constructor() {
    super('Invitation is invalid, expired, revoked, or already consumed.');
    this.name = 'InvalidInvitationError';
  }
}

export class ActiveInvitationExistsError extends Error {
  constructor() {
    super('An active invitation already exists for this email.');
    this.name = 'ActiveInvitationExistsError';
  }
}

export class InvalidInvitationInputError extends Error {
  constructor() {
    super('Invitation input is invalid.');
    this.name = 'InvalidInvitationInputError';
  }
}

export const unavailableInvitationDelivery: InvitationDelivery = {
  async deliver() {
    throw new InvitationDeliveryUnavailableError();
  },
};

export function normalizeEmail(email: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new InvalidInvitationInputError();
  }
  return normalizedEmail;
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function createInvitation(
  prisma: PrismaClient,
  input: { email: string; createdByUserId: string },
  delivery: InvitationDelivery,
): Promise<{ id: string; email: string; expiresAt: Date }> {
  const email = normalizeEmail(input.email);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashInvitationToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);

  const invitation = await prisma.$transaction(
    async (tx) => {
      const activeInvitation = await tx.invitation.findFirst({
        where: {
          email,
          status: { in: [InvitationStatus.PENDING_DELIVERY, InvitationStatus.ACTIVE] },
          expiresAt: { gt: now },
        },
        select: { id: true },
      });
      if (activeInvitation) {
        throw new ActiveInvitationExistsError();
      }
      const existingUser = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (existingUser) {
        throw new ActiveInvitationExistsError();
      }

      const created = await tx.invitation.create({
        data: {
          email,
          tokenHash,
          expiresAt,
          status: InvitationStatus.PENDING_DELIVERY,
          createdByUserId: input.createdByUserId,
        },
        select: { id: true, email: true, expiresAt: true },
      });
      await tx.auditEvent.create({
        data: {
          action: 'invitation.created',
          actorUserId: input.createdByUserId,
          targetId: created.id,
        },
      });
      return created;
    },
    { isolationLevel: 'Serializable' },
  );

  try {
    await delivery.deliver({ ...invitation, token });
  } catch (deliveryError) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.invitation.updateMany({
          where: { id: invitation.id, status: InvitationStatus.PENDING_DELIVERY },
          data: { status: InvitationStatus.DELIVERY_FAILED },
        });
        await tx.auditEvent.create({
          data: {
            action: 'invitation.delivery_failed',
            actorUserId: input.createdByUserId,
            targetId: invitation.id,
          },
        });
      });
    } catch (stateError) {
      throw new InvitationDeliveryUnavailableError({
        cause: new AggregateError([deliveryError, stateError]),
      });
    }
    throw new InvitationDeliveryUnavailableError({ cause: deliveryError });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const activated = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          status: InvitationStatus.PENDING_DELIVERY,
          expiresAt: { gt: new Date() },
        },
        data: { status: InvitationStatus.ACTIVE },
      });
      if (activated.count !== 1) {
        throw new InvitationActivationConflictError();
      }
      await tx.auditEvent.create({
        data: {
          action: 'invitation.activated',
          actorUserId: input.createdByUserId,
          targetId: invitation.id,
        },
      });
      return invitation;
    });
  } catch (error) {
    if (error instanceof InvitationActivationConflictError) {
      throw error;
    }
    throw new InvitationActivationUnavailableError({ cause: error });
  }
}

export async function acceptInvitation(
  prisma: PrismaClient,
  input: { email: string; name: string; password: string; token: string },
): Promise<{ id: string; name: string; email: string; role: string }> {
  const email = normalizeEmail(input.email);
  validatePassword(input.password);
  if (!input.name.trim() || input.name.trim().length > 128) {
    throw new InvalidInvitationInputError();
  }
  const tokenHash = hashInvitationToken(input.token);
  const now = new Date();
  const passwordHash = await hashCredentialPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({
      where: {
        email,
        tokenHash,
        status: InvitationStatus.ACTIVE,
        expiresAt: { gt: now },
      },
      data: { status: InvitationStatus.CONSUMED, consumedAt: now },
    });
    if (claimed.count !== 1) {
      throw new InvalidInvitationError();
    }

    const user = await createCredentialUser(tx, {
      email,
      name: input.name.trim(),
      passwordHash,
      role: USER_ROLES.user,
      emailVerified: true,
    });
    await tx.invitation.update({
      where: { tokenHash },
      data: { consumedUserId: user.id },
    });
    const acceptedInvitation = await tx.invitation.findFirstOrThrow({
      where: { tokenHash },
      select: { id: true },
    });
    await tx.auditEvent.create({
      data: {
        action: 'invitation.accepted',
        actorUserId: user.id,
        targetId: acceptedInvitation.id,
      },
    });
    return user;
  });
}

export async function revokeInvitation(
  prisma: PrismaClient,
  input: { id: string; actorUserId: string },
): Promise<boolean> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.invitation.updateMany({
      where: {
        id: input.id,
        status: {
          in: [
            InvitationStatus.PENDING_DELIVERY,
            InvitationStatus.ACTIVE,
            InvitationStatus.DELIVERY_FAILED,
          ],
        },
        consumedAt: null,
      },
      data: { status: InvitationStatus.REVOKED, revokedAt: now },
    });
    if (updated.count !== 1) {
      return false;
    }
    await tx.auditEvent.create({
      data: {
        action: 'invitation.revoked',
        actorUserId: input.actorUserId,
        targetId: input.id,
      },
    });
    return true;
  });
}
