import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { getDatabaseUrl } from './connection-url.js';
import type { DatabaseHealth } from './database.js';

config({ path: resolve(process.cwd(), '../../.env') });

let database: DatabaseHealth | undefined;
let prismaClient: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
    });
  }

  return prismaClient;
}

export function getDatabase(): DatabaseHealth {
  if (!database) {
    const client = getPrismaClient();
    database = {
      async check() {
        await client.$queryRaw`SELECT 1`;
      },
      disconnect() {
        return client.$disconnect();
      },
    };
  }

  return database;
}
