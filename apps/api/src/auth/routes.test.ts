import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import authRoutes, { sendAuthResponse } from './routes.js';
import type { AuthRuntime } from './auth.js';

describe('Fastify auth response bridge', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('preserves multiple Set-Cookie headers independently', async () => {
    const app = Fastify();
    apps.push(app);
    app.get('/', async (_request, reply) => {
      const headers = new Headers({ 'content-type': 'application/json' });
      headers.append('set-cookie', 'session=one; HttpOnly; SameSite=Lax');
      headers.append('set-cookie', 'session_data=two; HttpOnly; SameSite=Lax');
      return sendAuthResponse(new Response('{"ok":true}', { status: 200, headers }), reply);
    });

    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(response.cookies.map(({ name }) => name)).toEqual(['session', 'session_data']);
    expect(response.headers['set-cookie']).toHaveLength(2);
  });

  it('sanitizes server errors returned by Better Auth', async () => {
    const app = Fastify();
    apps.push(app);
    app.get('/', async (_request, reply) =>
      sendAuthResponse(new Response('database password leaked internally', { status: 500 }), reply),
    );

    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Authentication request failed.' });
    expect(response.body).not.toContain('database');
  });
});

function createFakeAuth() {
  const calls: string[] = [];
  const fakeAuth = {
    handler: async (req: Request) => {
      calls.push(new URL(req.url).pathname);
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    api: { getSession: async () => null },
  } as unknown as AuthRuntime;
  return { fakeAuth, calls };
}

describe('PROFILE-002A — Better Auth route protection', () => {
  it.each([
    '/api/auth/update-user',
    '/api/auth/update-user/',
    '/api/auth/UPDATE-USER',
    '/api/auth/change-email',
    '/api/auth/delete-user',
  ])('blocks %s before forwarding to Better Auth', async (url) => {
    const { fakeAuth, calls } = createFakeAuth();
    const app = Fastify();
    await app.register(authRoutes, { auth: fakeAuth });

    try {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { origin: 'http://127.0.0.1:5173' },
        payload: { name: 'Nombre sin validar', image: 'https://example.com/avatar.png' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'Forbidden' });
      expect(calls).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('still forwards legitimate authentication requests', async () => {
    const { fakeAuth, calls } = createFakeAuth();
    const app = Fastify();
    await app.register(authRoutes, { auth: fakeAuth });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        payload: { email: 'test@example.com', password: 'test-password' },
      });

      expect(response.statusCode).toBe(200);
      expect(calls).toEqual(['/api/auth/sign-in/email']);
    } finally {
      await app.close();
    }
  });
});
