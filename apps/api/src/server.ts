import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un entero entre 1 y 65535.');
}

const app = buildApp();

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, 'Closing API server.');

  try {
    await app.close();
  } catch (error) {
    app.log.error(
      { errorType: error instanceof Error ? error.name : 'UnknownError' },
      'Failed to close API server cleanly.',
    );
    process.exitCode = 1;
  }
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({
  port,
  host: process.env.HOST ?? '127.0.0.1',
});
