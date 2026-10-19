import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
  const startedProjects = new Set<string>();

  beforeAll(async () => {
    try {
      startComposeProject(originalProject, startedProjects);
      startComposeProject(cloneProject, startedProjects);
      originalPort = getComposeHostPort(originalProject);
      clonePort = getComposeHostPort(cloneProject);
      if (originalPort === clonePort) {
        throw new Error('Docker Compose assigned the same host port to both PostgreSQL fixtures.');
      }
      originalUrl = createDatabaseUrl(originalPort);
      originalDependencies = createDockerDependencies(originalProject, originalPort);

      await Promise.all([waitForPostgres(originalProject), waitForPostgres(cloneProject)]);

      originalPrisma = createPrismaClient(originalUrl);
      clonePrisma = createPrismaClient(createDatabaseUrl(clonePort));
      await runFixtureStep('connect authorized Prisma client', () => originalPrisma.$connect());
      await runFixtureStep('connect cloned Prisma client', () => clonePrisma.$connect());
      await Promise.all([
        seedCloneFixture(originalPrisma, 'authorized'),
        seedCloneFixture(clonePrisma, 'clone'),
      ]);

      originalIdentity = await runFixtureStep('verify authorized PostgreSQL identity', () =>
        assertLocalOnlyOperation(
          {
            nodeEnv: 'development',
            databaseUrl: originalUrl,
            allowedDatabaseIdentities: getDatabaseIdentityKey(originalUrl),
            prisma: originalPrisma,
          },
          originalDependencies,
        ),
      );
    } catch (error) {
      const diagnostics = await collectPostgresDiagnostics([...startedProjects]);
      throw new Error(
        [`Could not prepare local-only PostgreSQL fixture: ${safeErrorMessage(error)}`, diagnostics]
          .filter(Boolean)
          .join('\n'),
      );
    }
  }, 90_000);

  afterAll(async () => {
    const disconnectResults = await Promise.allSettled([
      originalPrisma?.$disconnect(),
      clonePrisma?.$disconnect(),
    ]);
    const cleanupResults = await Promise.allSettled(
      [...startedProjects].reverse().map((project) => stopComposeProject(project)),
    );
    const failures = [...disconnectResults, ...cleanupResults].filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map(({ reason }) => reason),
        'Could not clean up all temporary PostgreSQL Compose fixtures.',
      );
    }
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

function createDatabaseUrl(port: number): string {
  return `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${port}/${postgresDatabase}?schema=public`;
}

function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

function createDockerDependencies(project: string, port: number): LocalOnlyDockerDependencies {
  return {
    composeFile,
    composeProject: project,
    repositoryRoot,
    runDocker(args, cwd) {
      try {
        return execFileSync('docker', args, {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 20_000,
          env: {
            ...process.env,
            POSTGRES_DB: postgresDatabase,
            POSTGRES_USER: postgresUser,
            POSTGRES_PASSWORD: postgresPassword,
            POSTGRES_PORT: String(port),
          },
        }).trim();
      } catch (error) {
        const commandError = error as NodeJS.ErrnoException & {
          status?: number | null;
          stderr?: Buffer | string;
        };
        const stderr = Buffer.isBuffer(commandError.stderr)
          ? commandError.stderr.toString('utf8')
          : commandError.stderr;
        const safeStderr = stderr?.replaceAll(postgresPassword, '[REDACTED]').trim();
        const exitStatus = commandError.status ?? commandError.code ?? 'unknown';
        throw new Error(
          [`Docker command failed (exit ${exitStatus}): docker ${args.join(' ')}`, safeStderr]
            .filter(Boolean)
            .join('\n'),
        );
      }
    },
  };
}

function composeCommand(project: string, port: number, args: string[]): string {
  try {
    return execFileSync(
      'docker',
      ['compose', '--project-name', project, '--file', composeFile, ...args],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
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
  } catch (error) {
    const commandError = error as NodeJS.ErrnoException & {
      status?: number | null;
      stderr?: Buffer | string;
    };
    const stderr = Buffer.isBuffer(commandError.stderr)
      ? commandError.stderr.toString('utf8')
      : commandError.stderr;
    throw new Error(
      [
        `Docker Compose command failed (exit ${commandError.status ?? commandError.code ?? 'unknown'}): docker compose ${args.join(' ')}`,
        stderr?.replaceAll(postgresPassword, '[REDACTED]').trim(),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

function startComposeProject(project: string, startedProjects: Set<string>): void {
  startedProjects.add(project);
  composeCommand(project, 0, ['up', '--detach', 'postgres']);
}

function getComposeHostPort(project: string): number {
  const binding = composeCommand(project, 0, ['port', 'postgres', '5432']);
  const address = new URL(`http://${binding}`);
  if (address.hostname !== '127.0.0.1' || !address.port) {
    throw new Error('Docker Compose returned an invalid PostgreSQL host binding.');
  }
  return Number(address.port);
}

function stopComposeProject(project: string): void {
  try {
    composeCommand(project, 0, ['down', '--volumes', '--remove-orphans']);
  } catch (error) {
    throw new Error(
      `Could not clean up temporary Compose project ${project}: ${safeErrorMessage(error)}`,
    );
  }
}

async function waitForPostgres(project: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastStatus = 'not-created';
  while (Date.now() < deadline) {
    try {
      const containerId = composeCommand(project, 0, ['ps', '--all', '--quiet', 'postgres']);
      if (containerId) {
        lastStatus = execFileSync(
          'docker',
          [
            'inspect',
            '--format',
            '{{.State.Status}} / {{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}',
            containerId,
          ],
          {
            cwd: repositoryRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 10_000,
          },
        ).trim();
        if (lastStatus === 'running / healthy') {
          return;
        }
        if (lastStatus.startsWith('exited /') || lastStatus.endsWith('/ unhealthy')) {
          throw new Error(`Temporary PostgreSQL healthcheck reported ${lastStatus}.`);
        }
      }
    } catch (error) {
      lastStatus = safeErrorMessage(error);
      if (lastStatus.includes('healthcheck reported')) {
        throw error;
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(
    `Temporary PostgreSQL Compose service ${project} did not become healthy (last status: ${lastStatus}).`,
  );
}

async function runFixtureStep<T>(step: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new Error(
      `Temporary PostgreSQL fixture step failed: ${step}: ${safeErrorMessage(error)}`,
    );
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return message.replaceAll(postgresPassword, '[REDACTED]');
}

async function collectPostgresDiagnostics(projects: string[]): Promise<string> {
  const output: string[] = [];
  for (const project of projects) {
    try {
      const logs = composeCommand(project, 0, ['logs', '--no-color', '--tail', '30', 'postgres']);
      if (logs) {
        output.push(
          `Temporary PostgreSQL logs for ${project}:\n${logs.replaceAll(postgresPassword, '[REDACTED]')}`,
        );
      }
      const containerId = composeCommand(project, 0, ['ps', '--all', '--quiet', 'postgres']);
      if (containerId) {
        const state = execFileSync(
          'docker',
          [
            'inspect',
            '--format',
            '{{.State.Status}} / {{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}',
            containerId,
          ],
          {
            cwd: repositoryRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 10_000,
          },
        ).trim();
        output.push(`Temporary PostgreSQL state for ${project}: ${state}`);
      }
    } catch (error) {
      output.push(`Could not collect diagnostics for ${project}: ${safeErrorMessage(error)}`);
    }
  }
  return output.join('\n');
}

async function seedCloneFixture(prisma: PrismaClient, label: string): Promise<void> {
  await runFixtureStep(
    `${label} database: create fixture table`,
    () =>
      prisma.$executeRaw`
      CREATE TABLE local_only_clone_fixture (
        id INTEGER PRIMARY KEY,
        marker TEXT NOT NULL
      )
    `,
  );
  await runFixtureStep(
    `${label} database: insert fixture row`,
    () =>
      prisma.$executeRaw`
      INSERT INTO local_only_clone_fixture (id, marker)
      VALUES (1, 'same-data')
    `,
  );
}
