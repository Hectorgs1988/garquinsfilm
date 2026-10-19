import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { buildApp } from '../app.js';
import { getPrismaClient } from '../db/client.js';
import { FakeEmailSender } from '../test/fake-email-sender.js';
import { createAuthOptions } from './auth.js';

const integrationTestsEnabled = process.env.RUN_AUTH_INTEGRATION_TESTS === '1';
const allowedOrigin = 'http://127.0.0.1:5173';
const email = `auth-test-${Date.now()}@example.test`;
const password = 'integration-test-password-42';

describe.skipIf(!integrationTestsEnabled)('Better Auth PostgreSQL integration', () => {
  const prisma = getPrismaClient();
  const emailSender = new FakeEmailSender();
  const app = buildApp();
  const fixtureOptions = createAuthOptions({ emailSender });
  const fixtureAuth = betterAuth({
    ...fixtureOptions,
    emailAndPassword: {
      ...fixtureOptions.emailAndPassword,
      disableSignUp: false,
    },
  });
  const resetApp = buildApp({ auth: fixtureAuth });
  let cookies: string[];
  let fixtureUserId: string | undefined;

  beforeAll(async () => {
    const result = await fixtureAuth.api.signUpEmail({
      body: {
        name: 'Auth integration test',
        email,
        password,
      },
    });
    fixtureUserId = result.user.id;
  });

  afterAll(async () => {
    try {
      const userId = fixtureUserId;
      if (userId) {
        await prisma.verification.deleteMany({
          where: { value: userId, identifier: { startsWith: 'reset-password:' } },
        });
        await fixtureAuth.$context.then(({ internalAdapter }) =>
          internalAdapter.deleteUser(userId),
        );
      }
    } finally {
      await Promise.all([app.close(), resetApp.close()]);
    }
  });

  it('rejects public signup and requests from an untrusted origin', async () => {
    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: {
        origin: allowedOrigin,
        'content-type': 'application/json',
      },
      payload: { name: 'Blocked', email: `blocked-${Date.now()}@example.test`, password },
    });
    expect(signup.statusCode).toBe(400);
    expect(signup.json().code).toBe('EMAIL_PASSWORD_SIGN_UP_DISABLED');

    const badOrigin = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: {
        origin: 'https://attacker.invalid',
        'content-type': 'application/json',
      },
      payload: { email, password },
    });
    expect(badOrigin.statusCode).toBe(403);
    expect(badOrigin.body).not.toContain('password');
  });

  it('rejects a password-reset redirect outside the configured application origin', async () => {
    const response = await resetApp.inject({
      method: 'POST',
      url: '/api/auth/request-password-reset',
      headers: { origin: allowedOrigin, 'content-type': 'application/json' },
      payload: {
        email: `redirect-test-${Date.now()}@example.test`,
        redirectTo: 'https://attacker.invalid/reset-password',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(emailSender.messages).toHaveLength(0);
    expect(response.body).not.toContain('attacker.invalid');
  });

  it('authenticates, reads the session, restricts protected routes, and logs out', async () => {
    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/api/me',
    });
    expect(unauthenticated.statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: {
        origin: allowedOrigin,
        'content-type': 'application/json',
      },
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    cookies = login.cookies.map(({ name, value }) => `${name}=${value}`);
    expect(cookies.length).toBeGreaterThan(0);
    expect(login.cookies.every((cookie) => cookie.httpOnly)).toBe(true);
    expect(login.cookies.every((cookie) => !cookie.secure)).toBe(true);

    const cookie = cookies.join('; ');
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie, origin: allowedOrigin },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.email).toBe(email);

    const profile = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie, origin: allowedOrigin },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().user.role).toBe('user');

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: {
        cookie,
        origin: allowedOrigin,
        'content-type': 'application/json',
      },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);

    const expiredSession = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie, origin: allowedOrigin },
    });
    expect(expiredSession.statusCode).toBe(200);
    expect(expiredSession.body).toBe('null');

    const expiredProfile = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie, origin: allowedOrigin },
    });
    expect(expiredProfile.statusCode).toBe(401);
  });

  it('uses generic reset responses and consumes reset tokens once while revoking sessions', async () => {
    const login = await resetApp.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: allowedOrigin, 'content-type': 'application/json' },
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    const sessionCookie = login.cookies.map(({ name, value }) => `${name}=${value}`).join('; ');

    const known = await requestPasswordReset(email);
    const unknown = await requestPasswordReset(`missing-${Date.now()}@example.test`);
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.json()).toEqual(unknown.json());

    const resetMessage = emailSender.messages.find(({ to }) => to === email);
    expect(resetMessage?.subject).toContain('Recuperación');
    const resetURL = new URL(resetMessage!.text.match(/https?:\/\/\S+/)![0]);
    expect(resetURL.search).toBe('');
    const token = new URLSearchParams(resetURL.hash.slice(1)).get('token')!;
    expect(known.body).not.toContain(token);
    const verification = await prisma.verification.findFirstOrThrow({
      where: { identifier: `reset-password:${token}`, value: fixtureUserId },
    });
    expect(verification.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(verification.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000);

    const reset = await resetApp.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { origin: allowedOrigin, 'content-type': 'application/json' },
      payload: { token, newPassword: 'new-integration-password-43' },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.body).not.toContain(token);

    const oldSession = await resetApp.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: sessionCookie, origin: allowedOrigin },
    });
    expect(oldSession.body).toBe('null');

    const reused = await resetApp.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { origin: allowedOrigin, 'content-type': 'application/json' },
      payload: { token, newPassword: 'another-integration-password-44' },
    });
    expect(reused.statusCode).toBe(400);

    const newLogin = await resetApp.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: allowedOrigin, 'content-type': 'application/json' },
      payload: { email, password: 'new-integration-password-43' },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it('rejects expired reset tokens and keeps SMTP failures generic and unusable', async () => {
    const messageCount = emailSender.messages.length;
    const response = await requestPasswordReset(email);
    expect(response.statusCode).toBe(200);
    const resetURL = new URL(emailSender.messages[messageCount].text.match(/https?:\/\/\S+/)![0]);
    const expiredToken = new URLSearchParams(resetURL.hash.slice(1)).get('token')!;
    await prisma.verification.updateMany({
      where: { identifier: `reset-password:${expiredToken}` },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expired = await resetApp.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { origin: allowedOrigin, 'content-type': 'application/json' },
      payload: { token: expiredToken, newPassword: 'expired-reset-password-45' },
    });
    expect(expired.statusCode).toBe(400);
    await prisma.verification.deleteMany({
      where: { identifier: `reset-password:${expiredToken}` },
    });

    emailSender.failure = new Error('simulated SMTP failure');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failureResponse = await requestPasswordReset(email);
    expect(failureResponse.statusCode).toBe(200);
    expect(failureResponse.json()).toEqual(response.json());
    expect(emailSender.messages).toHaveLength(messageCount + 1);
    const loggedFailure = errorLog.mock.calls.flat().join(' ');
    expect(loggedFailure).not.toContain(email);
    expect(loggedFailure).not.toContain('reset-password:');
    expect(loggedFailure).not.toContain('simulated SMTP failure');
    errorLog.mockRestore();
    expect(
      await prisma.verification.count({
        where: { value: fixtureUserId, identifier: { startsWith: 'reset-password:' } },
      }),
    ).toBe(0);
    emailSender.failure = undefined;
  });

  it('rate limits password-reset requests', async () => {
    const first = await requestPasswordReset(`rate-limit-${Date.now()}@example.test`);
    const second = await requestPasswordReset(`rate-limit-${Date.now()}@example.test`);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
  });

  it('rate limits sign-in attempts', async () => {
    const attempts = [];
    for (let index = 0; index < 6; index += 1) {
      attempts.push(
        await app.inject({
          method: 'POST',
          url: '/api/auth/sign-in/email',
          headers: {
            origin: allowedOrigin,
            'content-type': 'application/json',
            'x-forwarded-for': `203.0.113.${index + 1}`,
          },
          payload: { email, password: 'incorrect-password' },
        }),
      );
    }
    expect(attempts.some((response) => response.statusCode === 429)).toBe(true);
  });

  async function requestPasswordReset(targetEmail: string) {
    return resetApp.inject({
      method: 'POST',
      url: '/api/auth/request-password-reset',
      headers: { origin: allowedOrigin, 'content-type': 'application/json' },
      payload: { email: targetEmail },
    });
  }
});
