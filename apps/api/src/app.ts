import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getAuthConfig } from './auth/config.js';
import invitationRoutes from './auth/invitation-routes.js';
import type { InvitationDelivery } from './auth/invitations.service.js';
import authRoutes from './auth/routes.js';
import { getDatabase } from './db/client.js';
import type { DatabaseHealth } from './db/database.js';
import healthRoute from './routes/health.js';

interface BuildAppOptions {
  database?: DatabaseHealth;
  invitationDelivery?: InvitationDelivery;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  const database = options.database ?? getDatabase();
  const { trustedOrigins } = getAuthConfig();

  app.register(cors, {
    origin: trustedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => request.ip,
  });
  app.register(authRoutes);
  app.register(invitationRoutes, { delivery: options.invitationDelivery });
  app.register(healthRoute, { database });
  app.addHook('onClose', async () => {
    await database.disconnect();
    if (database !== getDatabase()) {
      await getDatabase().disconnect();
    }
  });

  return app;
}
