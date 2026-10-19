import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { getDatabaseUrl } from './connection-url.js';

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === '1';

describe.skipIf(!enabled)('PostgreSQL integration', () => {
  it('reports readiness after a read-only PostgreSQL query', async () => {
    if (new URL(getDatabaseUrl()).hostname !== '127.0.0.1') {
      throw new Error(
        'The PostgreSQL integration test only permits a local database on 127.0.0.1.',
      );
    }

    const app = buildApp();
    try {
      const address = await app.listen({ host: '127.0.0.1', port: 0 });
      const response = await fetch(new URL('/ready', address));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok' });
    } finally {
      await app.close();
    }
  });
});
