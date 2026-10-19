import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  assertLocalOnlyOperation,
  getDatabaseIdentityKey,
  type LocalDatabaseIdentity,
  type LocalOnlyDockerDependencies,
} from './local-only.js';

const integrationTestsEnabled = process.env.RUN_AUTH_INTEGRATION_TESTS === '1';
const repositoryRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const composeFile = resolve(repositoryRoot, 'compose.yaml');
const postgresDatabase = 'garquinsfilm_local_only_test';
const postgresUser = 'gf_local_only_test';
const postgresPassword = 'local-only-temporary-test-password';

describe.skipIf(!integrationTestsEnabled)('local-only PostgreSQL-to-Compose association', () => {
  const suffix = randomBytes(6).toString('hex');
  const originalProject = `gf-local-auth-${suffix}`;
  const cloneProject = `gf-clone-auth-${suffix}`;
  let originalPort: number;
  let clonePort: number;
  let originalUrl: string;
  let originalPrisma: PrismaClient;
  let clonePrisma: PrismaClient;
  let originalIdentity: LocalDatabaseIdentity;
  let originalDependencies: LocalOnlyDockerDependencies;

  beforeAll(async () => {
    originalPort = await reserveEphemeralPort();
    clonePort = await reserveEphemeralPort();
    if (originalPort === clonePort) {
      clonePort = await reserveEphemeralPort();
    }
    originalUrl = createDatabaseUrl(originalPort);
    originalDependencies = createDockerDependencies(originalProject);

    startComposeProject(originalProject, originalPort);
    startComposeProject(cloneProject, clonePort);
    await waitForPostgres(originalProject, originalPort);
    await waitForPostgres(cloneProject, clonePort);

    originalPrisma = createPrismaClient(originalUrl);
    clonePrisma = createPrismaClient(createDatabaseUrl(clonePort));
    await Promise.all([seedCloneFixture(originalPrisma), seedCloneFixture(clonePrisma)]);

    originalIdentity = await assertLocalOnlyOperation(
      {
        nodeEnv: 'development',
        databaseUrl: originalUrl,
        allowedDatabaseIdentities: getDatabaseIdentityKey(originalUrl),
        prisma: originalPrisma,
      },
      originalDependencies,
    );
  }, 90_000);

  afterAll(async () => {
    await Promise.all([originalPrisma?.$disconnect(), clonePrisma?.$disconnect()]);
    stopComposeProject(cloneProject);
    stopComposeProject(originalProject);
  }, 90_000);

  it('accepts the effective connection to the authorized temporary Compose service', () => {
    expect(originalIdentity.containerId).toMatch(/^[a-f0-9]{64}$/);
    expect(originalIdentity.serverAddress.replace(/\/\d+$/, '')).toBe(
      originalIdentity.containerAddress,
    );
    expect(originalIdentity.hostPort).toBe(originalPort);
  });

  it('rejects a redirected connection to a clone with identical database contents before writes', async () => {
    const [originalData, cloneData] = await Promise.all([
      originalPrisma.$queryRaw<Array<{ marker: string }>>`
          SELECT marker FROM local_only_clone_fixture WHERE id = 1
        `,
      clonePrisma.$queryRaw<Array<{ marker: string }>>`
          SELECT marker FROM local_only_clone_fixture WHERE id = 1
        `,
    ]);
    expect(cloneData).toEqual(originalData);

    let writes = 0;
    await expect(
      assertLocalOnlyOperation(
        {
          nodeEnv: 'development',
          databaseUrl: originalUrl,
          allowedDatabaseIdentities: getDatabaseIdentityKey(originalUrl),
          prisma: clonePrisma,
        },
        originalDependencies,
      ).then(() => {
        writes += 1;
      }),
    ).rejects.toThrow('effective PostgreSQL connection');
    expect(writes).toBe(0);
  });
});

async function reserveEphemeralPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Could not reserve a temporary PostgreSQL port.');
  }
  const { port } = address;
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  return port;
}

function createDatabaseUrl(port: number): string {
  return `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${port}/${postgresDatabase}?schema=public`;
}

function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

function createDockerDependencies(project: string): LocalOnlyDockerDependencies {
  return {
    composeFile,
    composeProject: project,
    repositoryRoot,
    runDocker(args, cwd) {
      try {
        return execFileSync('docker', args, {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 20_000,
          env: process.env,
        }).trim();
      } catch {
        throw new Error('Docker Compose integration fixture command failed.');
      }
    },
  };
}

function composeCommand(project: string, port: number, args: string[]): string {
  return execFileSync(
    'docker',
    ['compose', '--project-name', project, '--file', composeFile, ...args],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 60_000,
      env: {
        ...process.env,
        POSTGRES_DB: postgresDatabase,
        POSTGRES_USER: postgresUser,
        POSTGRES_PASSWORD: postgresPassword,
        POSTGRES_PORT: String(port),
      },
    },
  ).trim();
}

function startComposeProject(project: string, port: number): void {
  composeCommand(project, port, ['up', '--detach', 'postgres']);
}

function stopComposeProject(project: string): void {
  try {
    composeCommand(project, 5432, ['down', '--volumes', '--remove-orphans']);
  } catch {
    throw new Error(`Could not clean up temporary Compose project ${project}.`);
  }
}

async function waitForPostgres(project: string, port: number): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      composeCommand(project, port, [
        'exec',
        '--no-TTY',
        'postgres',
        'pg_isready',
        '-U',
        postgresUser,
        '-d',
        postgresDatabase,
      ]);
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
  }
  throw new Error(`Temporary PostgreSQL Compose service ${project} did not become ready.`);
}

async function seedCloneFixture(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE local_only_clone_fixture (
      id INTEGER PRIMARY KEY,
      marker TEXT NOT NULL
    )
  `;
  await prisma.$executeRaw`
    INSERT INTO local_only_clone_fixture (id, marker)
    VALUES (1, 'same-data')
  `;
}
