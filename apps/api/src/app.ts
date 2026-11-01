import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { getAuthConfig } from './auth/config.js';
import { createTmdbClientProvider } from './catalog/tmdb.provider.js';
import type { TmdbClient } from './catalog/tmdb.client.js';
import invitationRoutes from './auth/invitation-routes.js';
import type { InvitationDelivery } from './auth/invitations.service.js';
import type { AuthRuntime } from './auth/auth.js';
import authRoutes from './auth/routes.js';
import { getDatabase } from './db/client.js';
import type { DatabaseHealth } from './db/database.js';
import healthRoute from './routes/health.js';
import catalogRoutes from './catalog/catalog.routes.js';
import libraryRoutes from './library/library.routes.js';
import type { LibraryRepository } from './library/library.service.js';
import ratingRoutes from './ratings/ratings.routes.js';
import type { RatingRepository } from './ratings/ratings.service.js';
import seasonProgressRoutes from './season-progress/season-progress.routes.js';
import type { SeasonProgressRepository } from './season-progress/season-progress.service.js';

interface BuildAppOptions {
  database?: DatabaseHealth;
  invitationDelivery?: InvitationDelivery;
  auth?: AuthRuntime;
  tmdbClient?: TmdbClient;
  libraryRepository?: LibraryRepository;
  ratingRepository?: RatingRepository;
  seasonProgressRepository?: SeasonProgressRepository;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  const database = options.database ?? getDatabase();
  const { trustedOrigins } = getAuthConfig();

  app.decorate('tmdb', createTmdbClientProvider({ client: options.tmdbClient, logger: app.log }));

  app.register(cors, {
    origin: trustedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => request.ip,
  });
  app.register(authRoutes, { auth: options.auth });
  app.register(invitationRoutes, {
    auth: options.auth,
    delivery: options.invitationDelivery,
  });
  app.register(catalogRoutes, {
    auth: options.auth,
  });
  app.register(libraryRoutes, {
    auth: options.auth,
    repository: options.libraryRepository,
  });
  app.register(ratingRoutes, {
    auth: options.auth,
    repository: options.ratingRepository,
  });
  app.register(seasonProgressRoutes, {
    auth: options.auth,
    repository: options.seasonProgressRepository,
  });

  app.register(healthRoute, { database });
  app.addHook('onClose', async () => {
    await database.disconnect();
    if (database !== getDatabase()) {
      await getDatabase().disconnect();
    }
  });

  return app;
}
