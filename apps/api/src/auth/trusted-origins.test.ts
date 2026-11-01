import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { AuthRuntime } from './auth.js';

const lanOrigin = 'http://192.168.1.13:5173';

function createApp() {
  const auth = {
    handler: async () => new Response('{"ok":true}', { status: 200 }),
    api: { getSession: async () => null },
  } as unknown as AuthRuntime;
  return buildApp({ auth });
}

async function signIn(app: ReturnType<typeof createApp>, origin: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin, 'content-type': 'application/json' },
    payload: { email: 'user@example.test', password: 'not-a-real-password' },
  });
}

describe('development LAN origins', () => {
  const apps: ReturnType<typeof createApp>[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function appWithOrigins(origins: string) {
    vi.stubEnv('BETTER_AUTH_TRUSTED_ORIGINS', origins);
    const app = createApp();
    apps.push(app);
    return app;
  }

  it('rejects an unlisted LAN origin with 403 by default', async () => {
    const app = appWithOrigins('http://127.0.0.1:5173,http://localhost:5173');
    expect((await signIn(app, lanOrigin)).statusCode).toBe(403);
  });

  it('accepts only the explicitly configured LAN origin and keeps localhost', async () => {
    const app = appWithOrigins(`http://127.0.0.1:5173,http://localhost:5173,${lanOrigin}`);

    expect((await signIn(app, lanOrigin)).statusCode).toBe(200);
    expect((await signIn(app, 'http://localhost:5173')).statusCode).toBe(200);
    expect((await signIn(app, 'http://192.168.1.14:5173')).statusCode).toBe(403);
    expect((await signIn(app, 'http://192.168.1.13:5174')).statusCode).toBe(403);
    expect((await signIn(app, 'https://attacker.invalid')).statusCode).toBe(403);
  });

  it('answers CORS preflight with credentials only for trusted origins', async () => {
    const app = appWithOrigins(`http://127.0.0.1:5173,${lanOrigin}`);
    const preflight = (origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/api/auth/sign-in/email',
        headers: { origin, 'access-control-request-method': 'POST' },
      });

    const allowed = await preflight(lanOrigin);
    expect(allowed.headers['access-control-allow-origin']).toBe(lanOrigin);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await preflight('http://192.168.1.99:5173');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
