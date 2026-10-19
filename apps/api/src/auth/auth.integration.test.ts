import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { betterAuth } from 'better-auth';
import { buildApp } from '../app.js';
import { createAuthOptions } from './auth.js';

const integrationTestsEnabled = process.env.RUN_AUTH_INTEGRATION_TESTS === '1';
const allowedOrigin = 'http://127.0.0.1:5173';
const email = `auth-test-${Date.now()}@example.test`;
const password = 'integration-test-password-42';

describe.skipIf(!integrationTestsEnabled)('Better Auth PostgreSQL integration', () => {
  const app = buildApp();
  const fixtureOptions = createAuthOptions();
  const fixtureAuth = betterAuth({
    ...fixtureOptions,
    emailAndPassword: {
      ...fixtureOptions.emailAndPassword,
      disableSignUp: false,
    },
  });
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
        await fixtureAuth.$context.then(({ internalAdapter }) =>
          internalAdapter.deleteUser(userId),
        );
      }
    } finally {
      await app.close();
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
});
