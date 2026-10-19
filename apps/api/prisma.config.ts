import { config } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';
import { getDatabaseUrl } from './src/db/connection-url.js';

config({ path: resolve(import.meta.dirname, '../../.env') });
process.env.DATABASE_URL ??= getDatabaseUrl();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
