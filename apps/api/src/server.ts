import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un entero entre 1 y 65535.');
}

const app = buildApp();

await app.listen({
  port,
  host: process.env.HOST ?? '127.0.0.1',
});
