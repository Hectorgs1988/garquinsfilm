import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  assertLocalConfirmation,
  assertLocalOnlyOperation,
  assertSameLocalDatabase,
  createLocalConfirmationChallenge,
  getDatabaseIdentityKey,
  type LocalDatabaseIdentity,
  type LocalOnlyDockerDependencies,
} from './local-only.js';

const databaseUrl =
  'postgresql://gf_local:local-test-only@127.0.0.1:55434/garquinsfilm_local?schema=public';
const allowedKey = getDatabaseIdentityKey(databaseUrl);
const containerId = 'a'.repeat(64);
const containerAddress = '172.20.0.2';
const port = 55434;

function createPrisma(
  rows = [
    {
      database: 'garquinsfilm_local',
      username: 'gf_local',
      schema: 'public',
      serverAddress: containerAddress,
      serverPort: 5432,
    },
  ],
) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(rows),
  } as unknown as PrismaClient;
}

function createDockerDependencies(
  options: {
    endpoint?: string;
    context?: string;
    serviceIds?: string[];
    running?: boolean;
    project?: string;
    service?: string;
    hostIp?: string;
    hostPort?: number;
    address?: string;
    additionalAddress?: string;
    fail?: boolean;
  } = {},
): LocalOnlyDockerDependencies {
  const inspection = {
    State: { Running: options.running ?? true },
    Config: {
      Labels: {
        'com.docker.compose.project': options.project ?? 'garquinsfilm',
        'com.docker.compose.service': options.service ?? 'postgres',
      },
    },
    NetworkSettings: {
      Ports: {
        '5432/tcp': [
          {
            HostIp: options.hostIp ?? '127.0.0.1',
            HostPort: String(options.hostPort ?? port),
          },
        ],
      },
      Networks: {
        default: { IPAddress: options.address ?? containerAddress },
        ...(options.additionalAddress ? { another: { IPAddress: options.additionalAddress } } : {}),
      },
    },
  };
  return {
    composeFile: '/repo/compose.yaml',
    composeProject: 'garquinsfilm',
    repositoryRoot: '/repo',
    runDocker: vi.fn((args) => {
      if (options.fail) {
        throw new Error('docker unavailable');
      }
      if (args[0] === 'context' && args[1] === 'show') {
        return options.context ?? 'desktop-linux';
      }
      if (args[0] === 'context' && args[1] === 'inspect') {
        return JSON.stringify(options.endpoint ?? 'unix:///var/run/docker.sock');
      }
      if (args[0] === 'compose') {
        return (options.serviceIds ?? [containerId]).join('\n');
      }
      if (args[0] === 'inspect') {
        return JSON.stringify(inspection);
      }
      throw new Error('unexpected Docker invocation');
    }),
  };
}

const input = (overrides: Partial<Parameters<typeof assertLocalOnlyOperation>[0]> = {}) => ({
  nodeEnv: 'development',
  databaseUrl,
  allowedDatabaseIdentities: allowedKey,
  prisma: createPrisma(),
  ...overrides,
});

async function expectRejectedWithoutWrites(
  operation: () => Promise<unknown>,
  writes: { count: number },
) {
  await expect(
    operation().then(() => {
      writes.count += 1;
    }),
  ).rejects.toThrow();
  expect(writes.count).toBe(0);
}

describe('local-only operation authorization', () => {
  it.each(['production', 'staging', 'test', undefined])(
    'rejects NODE_ENV=%s before Docker or SQL',
    async (nodeEnv) => {
      const docker = createDockerDependencies();
      const prisma = createPrisma();
      await expect(assertLocalOnlyOperation(input({ nodeEnv, prisma }), docker)).rejects.toThrow(
        'NODE_ENV=development',
      );
      expect(docker.runDocker).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it('requires an explicit destination allowlist', async () => {
    const docker = createDockerDependencies();
    const prisma = createPrisma();
    await expect(
      assertLocalOnlyOperation(input({ allowedDatabaseIdentities: undefined, prisma }), docker),
    ).rejects.toThrow('not allowlisted');
    expect(docker.runDocker).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('accepts a PostgreSQL connection only when it resolves to the authorized Compose service', async () => {
    const result = await assertLocalOnlyOperation(input(), createDockerDependencies());
    expect(result.containerId).toBe(containerId);
    expect(result.containerAddress).toBe(containerAddress);
    expect(result.serverAddress).toBe(containerAddress);
    expect(result.hostPort).toBe(port);
  });

  it('rejects unavailable Docker, stopped daemon, and remote contexts without writes', async () => {
    const writes = { count: 0 };
    await expectRejectedWithoutWrites(
      () => assertLocalOnlyOperation(input(), createDockerDependencies({ fail: true })),
      writes,
    );
    await expectRejectedWithoutWrites(
      () =>
        assertLocalOnlyOperation(
          input(),
          createDockerDependencies({ endpoint: 'ssh://docker.example.test' }),
        ),
      writes,
    );
    await expectRejectedWithoutWrites(
      () =>
        assertLocalOnlyOperation(
          input(),
          createDockerDependencies({ endpoint: 'tcp://192.0.2.20:2376' }),
        ),
      writes,
    );
    await expectRejectedWithoutWrites(
      () =>
        assertLocalOnlyOperation(input(), createDockerDependencies({ context: '--not-a-context' })),
      writes,
    );
    vi.stubEnv('DOCKER_HOST', 'tcp://192.0.2.20:2376');
    try {
      await expectRejectedWithoutWrites(
        () => assertLocalOnlyOperation(input(), createDockerDependencies()),
        writes,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects missing, stopped, duplicated, or mislabeled Compose services', async () => {
    const writes = { count: 0 };
    for (const docker of [
      createDockerDependencies({ serviceIds: [] }),
      createDockerDependencies({ serviceIds: [containerId, 'b'.repeat(64)] }),
      createDockerDependencies({ running: false }),
      createDockerDependencies({ additionalAddress: '172.20.0.3' }),
      createDockerDependencies({ project: 'another-project' }),
      createDockerDependencies({ service: 'another-service' }),
    ]) {
      await expectRejectedWithoutWrites(() => assertLocalOnlyOperation(input(), docker), writes);
    }
  });

  it('requires the configured host port and loopback-only published binding to match', async () => {
    const writes = { count: 0 };
    await expectRejectedWithoutWrites(
      () =>
        assertLocalOnlyOperation(
          input({
            databaseUrl:
              'postgresql://gf_local:local-test-only@127.0.0.1:55435/garquinsfilm_local?schema=public',
            allowedDatabaseIdentities: 'gf_local@127.0.0.1:55435/garquinsfilm_local?schema=public',
          }),
          createDockerDependencies(),
        ),
      writes,
    );
    await expectRejectedWithoutWrites(
      () => assertLocalOnlyOperation(input(), createDockerDependencies({ hostPort: 5433 })),
      writes,
    );
    await expectRejectedWithoutWrites(
      () => assertLocalOnlyOperation(input(), createDockerDependencies({ hostIp: '0.0.0.0' })),
      writes,
    );
  });

  it('rejects redirected PostgreSQL connections, including a clone with identical database identity', async () => {
    const writes = { count: 0 };
    for (const serverAddress of ['172.20.0.3', '172.20.0.4']) {
      const prisma = createPrisma([
        {
          database: 'garquinsfilm_local',
          username: 'gf_local',
          schema: 'public',
          serverAddress,
          serverPort: 5432,
        },
      ]);
      await expectRejectedWithoutWrites(
        () => assertLocalOnlyOperation(input({ prisma }), createDockerDependencies()),
        writes,
      );
    }
  });

  it('rejects an effective connection with a mismatched database, user, schema, address, or port', async () => {
    const writes = { count: 0 };
    for (const overrides of [
      { database: 'other_db' },
      { username: 'other_user' },
      { schema: 'other_schema' },
      { serverAddress: '172.20.0.99' },
      { serverPort: 5433 },
    ]) {
      const prisma = createPrisma([
        {
          ...{
            database: 'garquinsfilm_local',
            username: 'gf_local',
            schema: 'public',
            serverAddress: containerAddress,
            serverPort: 5432,
          },
          ...overrides,
        },
      ]);
      await expectRejectedWithoutWrites(
        () => assertLocalOnlyOperation(input({ prisma }), createDockerDependencies()),
        writes,
      );
    }
  });

  it('binds a fresh confirmation to operation, destination, and verified container', () => {
    const confirmed: LocalDatabaseIdentity = {
      key: allowedKey,
      database: 'garquinsfilm_local',
      username: 'gf_local',
      schema: 'public',
      endpoint: '127.0.0.1:55434',
      containerId,
      containerAddress,
      hostPort: port,
      serverAddress: containerAddress,
      serverPort: 5432,
    };
    const challenge = createLocalConfirmationChallenge(
      'bootstrap-first-admin',
      confirmed,
      'a'.repeat(32),
    );
    const changedNonce = createLocalConfirmationChallenge(
      'bootstrap-first-admin',
      confirmed,
      'b'.repeat(32),
    );
    const anotherContainer = createLocalConfirmationChallenge(
      'bootstrap-first-admin',
      { ...confirmed, containerId: 'b'.repeat(64) },
      'a'.repeat(32),
    );

    expect(() => assertLocalConfirmation(challenge, challenge)).not.toThrow();
    expect(() => assertLocalConfirmation(challenge, changedNonce)).toThrow('one-time');
    expect(() => assertLocalConfirmation(challenge, anotherContainer)).toThrow('one-time');
    expect(challenge).toContain(containerId.slice(0, 12));
    expect(challenge).toContain('bootstrap-first-admin');
  });

  it('detects the authorized container changing after confirmation', () => {
    const original: LocalDatabaseIdentity = {
      key: allowedKey,
      database: 'garquinsfilm_local',
      username: 'gf_local',
      schema: 'public',
      endpoint: '127.0.0.1:55434',
      containerId,
      containerAddress,
      hostPort: port,
      serverAddress: containerAddress,
      serverPort: 5432,
    };
    expect(() => assertSameLocalDatabase(original, { ...original })).not.toThrow();
    expect(() =>
      assertSameLocalDatabase(original, { ...original, containerId: 'b'.repeat(64) }),
    ).toThrow('changed before');
  });
});
