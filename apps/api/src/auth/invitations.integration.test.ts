import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { betterAuth } from 'better-auth';
import { getPrismaClient } from '../db/client.js';
import { buildApp } from '../app.js';
import { InvitationStatus, Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { AdminAlreadyBootstrappedError, bootstrapFirstAdmin } from './bootstrap.service.js';
import { createAuthOptions } from './auth.js';
import { getAuthConfig } from './config.js';
import { createInvitationEmailDelivery } from '../email/email.service.js';
import { FakeEmailSender } from '../test/fake-email-sender.js';
import {
  acceptInvitation,
  createInvitation,
  hashInvitationToken,
  InvitationActivationUnavailableError,
  InvitationDeliveryUnavailableError,
  revokeInvitation,
} from './invitations.service.js';

const integrationTestsEnabled = process.env.RUN_AUTH_INTEGRATION_TESTS === '1';
const origin = 'http://127.0.0.1:5173';
const fixturePassword = 'invitation-test-password-42';
const adminEmail = `auth-invite-admin-${Date.now()}@example.test`;
const regularEmail = `auth-invite-user-${Date.now()}@example.test`;

describe.skipIf(!integrationTestsEnabled)('invitation and bootstrap PostgreSQL integration', () => {
  const prisma = getPrismaClient();
  const deliveredTokens = new Map<string, string>();
  const emailSender = new FakeEmailSender();
  const invitationEmailDelivery = createInvitationEmailDelivery(
    emailSender,
    getAuthConfig().webAppURL,
  );
  const createdUserIds: string[] = [];
  const app = buildApp({
    invitationDelivery: {
      async deliver(invitation) {
        deliveredTokens.set(invitation.id, invitation.token);
        await invitationEmailDelivery.deliver(invitation);
      },
    },
  });
  const fixtureAuth = betterAuth({
    ...createAuthOptions(),
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      requireEmailVerification: false,
    },
  });
  let adminId: string;
  let regularUserId: string;
  let adminCookie: string;
  let regularCookie: string;
  let bootstrappedAdminEmail: string;

  beforeAll(async () => {
    if (!process.env.AUTH_TEST_DATABASE_URL) {
      throw new Error('AUTH_TEST_DATABASE_URL is required for PostgreSQL integration tests.');
    }

    const bootstrapCandidates = [
      { email: adminEmail, name: 'Invitation test administrator A' },
      {
        email: `auth-invite-admin-race-${Date.now()}@example.test`,
        name: 'Invitation test administrator B',
      },
    ];
    const bootstrapResults = await Promise.allSettled(
      bootstrapCandidates.map(({ email, name }) =>
        bootstrapFirstAdmin(prisma, { email, name, password: fixturePassword }, async () => {}),
      ),
    );
    const successfulBootstraps = bootstrapResults.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof bootstrapFirstAdmin>>> =>
        result.status === 'fulfilled',
    );
    const rejectedBootstraps = bootstrapResults.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(successfulBootstraps).toHaveLength(1);
    expect(rejectedBootstraps).toHaveLength(1);
    expect(rejectedBootstraps[0].reason).toBeInstanceOf(AdminAlreadyBootstrappedError);
    bootstrappedAdminEmail =
      bootstrapCandidates[bootstrapResults.findIndex((result) => result.status === 'fulfilled')]
        .email;
    const admin = successfulBootstraps[0].value;
    adminId = admin.id;
    createdUserIds.push(adminId);
    expect(await prisma.user.count({ where: { role: 'admin' } })).toBe(1);
    await expect(
      bootstrapFirstAdmin(
        prisma,
        {
          email: `second-admin-${Date.now()}@example.test`,
          name: 'Second administrator',
          password: fixturePassword,
        },
        async () => {},
      ),
    ).rejects.toBeInstanceOf(AdminAlreadyBootstrappedError);
    const regular = await fixtureAuth.api.signUpEmail({
      body: {
        name: 'Invitation test user',
        email: regularEmail,
        password: fixturePassword,
      },
    });
    regularUserId = regular.user.id;
    createdUserIds.push(regularUserId);
    adminCookie = await signInAndGetCookie(bootstrappedAdminEmail);
    regularCookie = await signInAndGetCookie(regularEmail);
  });

  afterAll(async () => {
    await prisma.invitation.deleteMany({ where: { createdByUserId: adminId } });
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await app.close();
  });

  it('requires a session and admin role to manage invitations', async () => {
    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/api/admin/invitations',
      headers: { origin, 'content-type': 'application/json' },
      payload: { email: 'unauthorized@example.test' },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const regularUser = await app.inject({
      method: 'POST',
      url: '/api/admin/invitations',
      headers: { origin, cookie: regularCookie, 'content-type': 'application/json' },
      payload: { email: 'unauthorized@example.test' },
    });
    expect(regularUser.statusCode).toBe(403);

    const roleInjection = await app.inject({
      method: 'POST',
      url: '/api/admin/invitations',
      headers: { origin, cookie: adminCookie, 'content-type': 'application/json' },
      payload: { email: 'role-injection@example.test', role: 'admin' },
    });
    expect(roleInjection.statusCode).toBe(400);

    const roleUpdate = await app.inject({
      method: 'POST',
      url: '/api/auth/update-user',
      headers: {
        origin,
        cookie: regularCookie,
        'content-type': 'application/json',
      },
      payload: { role: 'admin' },
    });
    expect(roleUpdate.statusCode).not.toBe(200);
    const regularProfile = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: regularCookie },
    });
    expect(regularProfile.json().user.role).toBe('user');

    const noOrigin = await app.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      headers: { 'content-type': 'application/json' },
      payload: {
        email: 'nobody@example.test',
        name: 'No Origin',
        password: fixturePassword,
        token: 'x'.repeat(43),
      },
    });
    expect(noOrigin.statusCode).toBe(403);
  });

  it('creates a normalized invitation without exposing its token or hash', async () => {
    const response = await createInvite('  Invitee@Example.test  ');
    expect(response.statusCode).toBe(201);
    expect(response.json().invitation.email).toBe('invitee@example.test');
    expect(response.body).not.toContain(deliveredTokens.get(response.json().invitation.id));
    expect(response.body).not.toContain('tokenHash');

    const invitation = await prisma.invitation.findUniqueOrThrow({
      where: { id: response.json().invitation.id },
    });
    expect(invitation.status).toBe(InvitationStatus.ACTIVE);
    const token = deliveredTokens.get(invitation.id)!;
    expect(invitation.tokenHash).toBe(hashInvitationToken(token));
    expect(invitation.tokenHash).not.toBe(token);
    const invitationMessage = emailSender.messages.at(-1)!;
    const invitationURL = new URL(invitationMessage.text.match(/https?:\/\/\S+/)![0]);
    expect(invitationURL.search).toBe('');
    expect(new URLSearchParams(invitationURL.hash.slice(1)).get('token')).toBe(token);
    expect(response.body).not.toContain(token);
    expect(invitation.expiresAt.getTime() - invitation.createdAt.getTime()).toBeGreaterThan(
      7 * 24 * 60 * 60 * 1000 - 1000,
    );

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/invitations',
      headers: { cookie: adminCookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain('tokenHash');
    expect(list.body).not.toContain(token);
  });

  it('accepts only for the bound email, grants user role and cannot be reused', async () => {
    const created = await createInvite(`valid-${Date.now()}@example.test`);
    const invitation = created.json().invitation;
    const token = deliveredTokens.get(invitation.id)!;

    const mismatch = await acceptInvite('other@example.test', token);
    expect(mismatch.statusCode).toBe(400);

    const roleInjection = await app.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      headers: { origin, 'content-type': 'application/json' },
      payload: {
        email: invitation.email,
        name: 'Role escalation',
        password: fixturePassword,
        token,
        role: 'admin',
      },
    });
    expect(roleInjection.statusCode).toBe(400);

    const accepted = await acceptInvite(invitation.email.toUpperCase(), token);
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().user.email).toBe(invitation.email);
    expect(accepted.json().user.role).toBe('user');
    expect(accepted.body).not.toContain(token);
    createdUserIds.push(accepted.json().user.id);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: accepted.json().user.id } }))
        .emailVerified,
    ).toBe(true);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin, 'content-type': 'application/json' },
      payload: { email: invitation.email, password: fixturePassword },
    });
    expect(login.statusCode).toBe(200);

    const record = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(record.status).toBe(InvitationStatus.CONSUMED);
    expect(record.consumedAt).not.toBeNull();
    expect(record.consumedUserId).toBe(accepted.json().user.id);

    const reused = await acceptInvite(invitation.email, token);
    expect(reused.statusCode).toBe(400);
  });

  it('rejects revoked and expired invitations', async () => {
    const revoked = await createInvite(`revoked-${Date.now()}@example.test`);
    const revokedId = revoked.json().invitation.id;
    const revokeResponse = await app.inject({
      method: 'DELETE',
      url: `/api/admin/invitations/${revokedId}`,
      headers: { origin, cookie: adminCookie },
    });
    expect(revokeResponse.statusCode).toBe(204);
    expect(
      (await acceptInvite(revoked.json().invitation.email, deliveredTokens.get(revokedId)!))
        .statusCode,
    ).toBe(400);

    const expired = await createInvite(`expired-${Date.now()}@example.test`);
    const expiredId = expired.json().invitation.id;
    await prisma.invitation.update({
      where: { id: expiredId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await acceptInvite(expired.json().invitation.email, deliveredTokens.get(expiredId)!))
        .statusCode,
    ).toBe(400);
  });

  it('keeps failed or uncommitted deliveries unusable and recoverable by revocation', async () => {
    const failedEmail = `delivery-failed-${Date.now()}@example.test`;
    let failedToken = '';
    await expect(
      createInvitation(
        prisma,
        { email: failedEmail, createdByUserId: adminId },
        {
          async deliver(invitation) {
            failedToken = invitation.token;
            throw new Error('simulated delivery failure');
          },
        },
      ),
    ).rejects.toBeInstanceOf(InvitationDeliveryUnavailableError);
    const failed = await prisma.invitation.findFirstOrThrow({ where: { email: failedEmail } });
    expect(failed.status).toBe(InvitationStatus.DELIVERY_FAILED);
    await expect(
      acceptInvitation(prisma, {
        email: failedEmail,
        name: 'Should not register',
        password: fixturePassword,
        token: failedToken,
      }),
    ).rejects.toThrow();
    await expect(revokeInvitation(prisma, { id: failed.id, actorUserId: adminId })).resolves.toBe(
      true,
    );

    const acceptedToken: string[] = [];
    const activationFailureClient = createTransactionFailureClient(prisma, 2);
    const ambiguousEmail = `activation-failed-${Date.now()}@example.test`;
    await expect(
      createInvitation(
        activationFailureClient,
        { email: ambiguousEmail, createdByUserId: adminId },
        {
          async deliver(invitation) {
            acceptedToken.push(invitation.token);
          },
        },
      ),
    ).rejects.toBeInstanceOf(InvitationActivationUnavailableError);
    const pending = await prisma.invitation.findFirstOrThrow({ where: { email: ambiguousEmail } });
    expect(pending.status).toBe(InvitationStatus.PENDING_DELIVERY);
    await expect(
      acceptInvitation(prisma, {
        email: ambiguousEmail,
        name: 'Delivered but inactive',
        password: fixturePassword,
        token: acceptedToken[0],
      }),
    ).rejects.toThrow();

    const deliveryAndStateFailureClient = createTransactionFailureClient(prisma, 2);
    const stateFailureEmail = `state-failed-${Date.now()}@example.test`;
    let unconfirmedToken = '';
    await expect(
      createInvitation(
        deliveryAndStateFailureClient,
        { email: stateFailureEmail, createdByUserId: adminId },
        {
          async deliver(invitation) {
            unconfirmedToken = invitation.token;
            throw new Error('simulated delivery failure');
          },
        },
      ),
    ).rejects.toBeInstanceOf(InvitationDeliveryUnavailableError);
    const stillPending = await prisma.invitation.findFirstOrThrow({
      where: { email: stateFailureEmail },
    });
    expect(stillPending.status).toBe(InvitationStatus.PENDING_DELIVERY);
    await expect(
      acceptInvitation(prisma, {
        email: stateFailureEmail,
        name: 'Unconfirmed delivery',
        password: fixturePassword,
        token: unconfirmedToken,
      }),
    ).rejects.toThrow();

    for (const invitation of [pending, stillPending]) {
      await expect(
        revokeInvitation(prisma, { id: invitation.id, actorUserId: adminId }),
      ).resolves.toBe(true);
    }
  });

  it('atomically consumes an invitation under concurrent acceptance', async () => {
    const created = await createInvite(`concurrent-${Date.now()}@example.test`);
    const invitation = created.json().invitation;
    const token = deliveredTokens.get(invitation.id)!;

    const responses = await Promise.allSettled([
      acceptInvitation(prisma, {
        email: invitation.email,
        token,
        name: 'Concurrent A',
        password: fixturePassword,
      }),
      acceptInvitation(prisma, {
        email: invitation.email,
        token,
        name: 'Concurrent B',
        password: fixturePassword,
      }),
    ]);
    expect(responses.filter((response) => response.status === 'fulfilled')).toHaveLength(1);
    expect(responses.filter((response) => response.status === 'rejected')).toHaveLength(1);
    const successfulAcceptance = responses.find(
      (
        response,
      ): response is PromiseFulfilledResult<Awaited<ReturnType<typeof acceptInvitation>>> =>
        response.status === 'fulfilled',
    )!;
    createdUserIds.push(successfulAcceptance.value.id);
    expect(await prisma.user.count({ where: { email: invitation.email, role: 'user' } })).toBe(1);
  });

  function createTransactionFailureClient(prisma: PrismaClient, failOn: number): PrismaClient {
    let transactionCalls = 0;
    return new Proxy(prisma, {
      get(target, property, receiver) {
        if (property === '$transaction') {
          return (
            callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options?: { isolationLevel?: 'Serializable' },
          ) => {
            transactionCalls += 1;
            if (transactionCalls === failOn) {
              throw new Error('simulated PostgreSQL outage');
            }
            const transaction = Reflect.get(target, property, target) as (
              callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
              options?: { isolationLevel?: 'Serializable' },
            ) => Promise<unknown>;
            return transaction.call(target, callback, options);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  it('limits invitation creation attempts per client', async () => {
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        app.inject({
          method: 'POST',
          url: '/api/admin/invitations',
          headers: {
            origin,
            cookie: adminCookie,
            'content-type': 'application/json',
          },
          payload: { email: `limited-${Date.now()}-${index}@example.test` },
        }),
      ),
    );
    expect(responses.some((response) => response.statusCode === 429)).toBe(true);
  });

  async function createInvite(email: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/invitations',
      headers: { origin, cookie: adminCookie, 'content-type': 'application/json' },
      payload: { email },
    });
    return response;
  }

  async function acceptInvite(email: string, token: string, name = 'Invited user') {
    return app.inject({
      method: 'POST',
      url: '/api/invitations/accept',
      headers: { origin, 'content-type': 'application/json' },
      payload: { email, name, password: fixturePassword, token },
    });
  }

  async function signInAndGetCookie(email: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin, 'content-type': 'application/json' },
      payload: { email, password: fixturePassword },
    });
    expect(response.statusCode).toBe(200);
    return response.cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
  }
});
