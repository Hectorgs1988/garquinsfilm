import type { FastifyPluginAsync } from 'fastify';
import type { DatabaseHealth } from '../db/database.js';

interface HealthRouteOptions {
  database: DatabaseHealth;
}

const healthRoute: FastifyPluginAsync<HealthRouteOptions> = async (app, { database }) => {
  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async (request, reply) => {
    try {
      await database.check();
      return { status: 'ok' };
    } catch (error) {
      request.log.warn(
        { errorType: error instanceof Error ? error.name : 'UnknownError' },
        'PostgreSQL readiness check failed',
      );
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
};

export default healthRoute;
