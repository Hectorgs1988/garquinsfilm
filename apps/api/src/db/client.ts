import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { getDatabaseUrl } from './connection-url.js';
import type { DatabaseHealth } from './database.js';

config({ path: resolve(process.cwd(), '../../.env') });

let database: DatabaseHealth | undefined;

export function getDatabase(): DatabaseHealth {
  if (database) {
    return database;
  }

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
  });

  database = {
    async check() {
      await client.$queryRaw`SELECT 1`;
    },
    disconnect() {
      return client.$disconnect();
    },
  };

  return database;
}
