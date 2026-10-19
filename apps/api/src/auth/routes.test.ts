import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { sendAuthResponse } from './routes.js';

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
