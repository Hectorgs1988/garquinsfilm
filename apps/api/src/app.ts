import Fastify from 'fastify';
import cors from '@fastify/cors';
import { getAuthConfig } from './auth/config.js';
import authRoutes from './auth/routes.js';
import { getDatabase } from './db/client.js';
import type { DatabaseHealth } from './db/database.js';
import healthRoute from './routes/health.js';

interface BuildAppOptions {
  database?: DatabaseHealth;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify();
  const database = options.database ?? getDatabase();
  const { trustedOrigins } = getAuthConfig();

  app.register(cors, {
    origin: trustedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.register(authRoutes);
  app.register(healthRoute, { database });
  app.addHook('onClose', async () => {
    await database.disconnect();
    if (database !== getDatabase()) {
      await getDatabase().disconnect();
    }
  });

  return app;
}
