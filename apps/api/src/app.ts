import Fastify from 'fastify';
import { getDatabase } from './db/client.js';
import type { DatabaseHealth } from './db/database.js';
import healthRoute from './routes/health.js';

interface BuildAppOptions {
  database?: DatabaseHealth;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify();
  const database = options.database ?? getDatabase();

  app.register(healthRoute, { database });
  app.addHook('onClose', async () => database.disconnect());

  return app;
}
