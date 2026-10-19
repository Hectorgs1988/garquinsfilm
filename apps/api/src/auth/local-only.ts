import { randomBytes, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '../generated/prisma/client.js';

const composeFile = resolve(fileURLToPath(new URL('../../../../compose.yaml', import.meta.url)));
const composeProject = 'garquinsfilm';
const composeService = 'postgres';
const postgresPort = 5432;
const repositoryRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

export interface LocalDatabaseIdentity {
  key: string;
  database: string;
  username: string;
  schema: string;
  endpoint: string;
  containerId: string;
  containerAddress: string;
  hostPort: number;
  serverAddress: string;
  serverPort: number;
}

export interface LocalOnlyDockerDependencies {
  runDocker(args: string[], cwd: string): string;
  composeFile: string;
  composeProject: string;
  repositoryRoot: string;
}

interface DockerContainerInspection {
  State?: { Running?: boolean };
  Config?: { Labels?: Record<string, string> };
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
    Networks?: Record<string, { IPAddress?: string }>;
  };
}

const defaultDockerDependencies: LocalOnlyDockerDependencies = {
  runDocker(args, cwd) {
    try {
      return execFileSync('docker', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 10_000,
      }).trim();
    } catch {
      throw new Error('Docker Compose destination verification failed.');
    }
  },
  composeFile,
  composeProject,
  repositoryRoot,
};

export async function assertLocalOnlyOperation(
  input: {
    nodeEnv?: string;
    databaseUrl: string;
    allowedDatabaseIdentities: string | undefined;
    prisma: PrismaClient;
  },
  dependencies: LocalOnlyDockerDependencies = defaultDockerDependencies,
): Promise<LocalDatabaseIdentity> {
  if (input.nodeEnv !== 'development') {
    throw new Error('This operation requires NODE_ENV=development.');
  }

  const url = parseDatabaseUrl(input.databaseUrl);
  const identity = getDatabaseIdentity(url);
  const allowed = new Set(
    (input.allowedDatabaseIdentities ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  if (!allowed.has(identity.key)) {
    throw new Error('The configured PostgreSQL destination is not allowlisted.');
  }

  const container = await getAuthorizedComposeContainer(dependencies);
  if (container.hostPort !== Number(url.port || '5432')) {
    throw new Error(
      'The configured PostgreSQL port does not match the authorized Compose service.',
    );
  }

  const rows = await input.prisma.$queryRaw<
    Array<{
      database: string;
      username: string;
      schema: string;
      serverAddress: string | null;
      serverPort: number | null;
    }>
  >`
    SELECT current_database() AS "database",
           current_user AS "username",
           current_schema() AS "schema",
           inet_server_addr()::text AS "serverAddress",
           inet_server_port() AS "serverPort"
  `;
  if (rows.length !== 1) {
    throw new Error('Unable to verify the effective PostgreSQL connection.');
  }
  const [actual] = rows;
  if (
    actual.database !== identity.database ||
    actual.username !== identity.username ||
    actual.schema !== identity.schema ||
    !actual.serverAddress ||
    actual.serverPort !== postgresPort ||
    normalizeAddress(actual.serverAddress) !== normalizeAddress(container.containerAddress)
  ) {
    throw new Error(
      'The effective PostgreSQL connection does not match the authorized Compose container.',
    );
  }

  return {
    ...identity,
    containerId: container.id,
    containerAddress: container.containerAddress,
    hostPort: container.hostPort,
    serverAddress: actual.serverAddress,
    serverPort: actual.serverPort,
  };
}

async function getAuthorizedComposeContainer(
  dependencies: LocalOnlyDockerDependencies,
): Promise<{ id: string; containerAddress: string; hostPort: number }> {
  if (process.env.DOCKER_HOST) {
    throw new Error('Docker host overrides are not permitted for local administrative operations.');
  }

  const context = dependencies.runDocker(['context', 'show'], dependencies.repositoryRoot);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(context)) {
    throw new Error('The active Docker context name is invalid.');
  }
  const endpointOutput = dependencies.runDocker(
    ['context', 'inspect', context, '--format', '{{json .Endpoints.docker.Host}}'],
    dependencies.repositoryRoot,
  );
  let dockerEndpoint: unknown;
  try {
    dockerEndpoint = JSON.parse(endpointOutput);
  } catch {
    throw new Error('Unable to verify the Docker context endpoint.');
  }
  if (
    typeof dockerEndpoint !== 'string' ||
    (!dockerEndpoint.startsWith('unix://') && !dockerEndpoint.startsWith('npipe://'))
  ) {
    throw new Error(
      'Remote Docker contexts are not permitted for local administrative operations.',
    );
  }

  const composeArgs = [
    'compose',
    '--project-name',
    dependencies.composeProject,
    '--file',
    dependencies.composeFile,
  ];
  const containerIds = dependencies
    .runDocker(
      [...composeArgs, 'ps', '--all', '--quiet', composeService],
      dependencies.repositoryRoot,
    )
    .split(/\s+/)
    .filter(Boolean);
  if (containerIds.length !== 1) {
    throw new Error('The authorized Docker Compose service must have exactly one container.');
  }
  if (!/^[a-f0-9]{12,64}$/i.test(containerIds[0])) {
    throw new Error('Docker Compose returned an invalid container identifier.');
  }

  let inspected: DockerContainerInspection;
  try {
    inspected = JSON.parse(
      dependencies.runDocker(
        ['inspect', '--format', '{{json .}}', containerIds[0]],
        dependencies.repositoryRoot,
      ),
    ) as DockerContainerInspection;
  } catch {
    throw new Error('Unable to inspect the authorized Docker Compose container.');
  }

  const labels = inspected.Config?.Labels ?? {};
  if (
    inspected.State?.Running !== true ||
    labels['com.docker.compose.project'] !== dependencies.composeProject ||
    labels['com.docker.compose.service'] !== composeService
  ) {
    throw new Error('The Docker container is not the running authorized Compose service.');
  }

  const addresses = Object.values(inspected.NetworkSettings?.Networks ?? {})
    .map((network) => network.IPAddress)
    .filter((address): address is string => Boolean(address));
  const bindings = inspected.NetworkSettings?.Ports?.['5432/tcp'] ?? [];
  if (addresses.length !== 1 || bindings.length !== 1) {
    throw new Error('The authorized Compose container has ambiguous network or port bindings.');
  }
  const [binding] = bindings;
  const hostPort = Number(binding.HostPort);
  if (binding.HostIp !== '127.0.0.1' || !Number.isInteger(hostPort)) {
    throw new Error('The Compose PostgreSQL port must be published only on IPv4 loopback.');
  }

  return {
    id: containerIds[0],
    containerAddress: addresses[0],
    hostPort,
  };
}

function normalizeAddress(address: string): string {
  const [addressValue, prefix, ...extra] = address.toLowerCase().split('/');
  const normalized = addressValue.replace(/^::ffff:/, '');
  const ipVersion = isIP(normalized);
  const prefixValue = prefix === undefined ? undefined : Number(prefix);
  if (
    !ipVersion ||
    extra.length > 0 ||
    (prefixValue !== undefined &&
      (!Number.isInteger(prefixValue) ||
        prefixValue < 0 ||
        prefixValue > (ipVersion === 4 ? 32 : 128)))
  ) {
    throw new Error('The PostgreSQL server address is invalid.');
  }
  return normalized;
}

export function assertSameLocalDatabase(
  expected: LocalDatabaseIdentity,
  observed: LocalDatabaseIdentity,
): void {
  if (
    expected.key !== observed.key ||
    expected.containerId !== observed.containerId ||
    expected.containerAddress !== observed.containerAddress ||
    expected.hostPort !== observed.hostPort ||
    normalizeAddress(expected.serverAddress) !== normalizeAddress(observed.serverAddress) ||
    expected.serverPort !== observed.serverPort
  ) {
    throw new Error('The authorized PostgreSQL container changed before the operation.');
  }
}

export function getDatabaseIdentityKey(databaseUrl: string): string {
  return getDatabaseIdentity(parseDatabaseUrl(databaseUrl)).key;
}

export function createLocalConfirmationChallenge(
  operation: string,
  identity: LocalDatabaseIdentity,
  nonce = randomBytes(16).toString('hex'),
): string {
  if (!/^[a-z][a-z0-9_-]*$/.test(operation) || !/^[a-f0-9]{32}$/.test(nonce)) {
    throw new Error('Invalid local confirmation challenge.');
  }
  return `CONFIRM ${operation} ${identity.key} CONTAINER ${identity.containerId.slice(0, 12)} ${nonce}`;
}

export function assertLocalConfirmation(expected: string, received: string): void {
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  if (
    expectedBytes.length !== receivedBytes.length ||
    !timingSafeEqual(expectedBytes, receivedBytes)
  ) {
    throw new Error('The one-time operation confirmation did not match.');
  }
}

export async function requestLocalConfirmation(
  operation: string,
  identity: LocalDatabaseIdentity,
): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('A local interactive terminal is required for this operation.');
  }
  const challenge = createLocalConfirmationChallenge(operation, identity);
  process.stdout.write(
    `Target: ${identity.key} (Compose container ${identity.containerId.slice(0, 12)}, ${identity.serverAddress}:${identity.serverPort})\n`,
  );
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const response = await terminal.question(`Type this one-time confirmation: ${challenge}\n> `);
    assertLocalConfirmation(challenge, response);
  } finally {
    terminal.close();
  }
}

function parseDatabaseUrl(databaseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('A valid PostgreSQL connection URL is required.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    !url.username ||
    !url.password ||
    !url.pathname.slice(1) ||
    url.searchParams.getAll('schema').length > 1 ||
    [...url.searchParams.keys()].some((key) => key !== 'schema') ||
    url.hash
  ) {
    throw new Error('Local operations require an unambiguous IPv4 loopback PostgreSQL URL.');
  }
  return url;
}

function getDatabaseIdentity(
  url: URL,
): Omit<
  LocalDatabaseIdentity,
  'containerId' | 'containerAddress' | 'hostPort' | 'serverAddress' | 'serverPort'
> {
  const database = decodeURIComponent(url.pathname.slice(1));
  const username = decodeURIComponent(url.username);
  const port = url.port || '5432';
  const schema = url.searchParams.get('schema') ?? 'public';
  const endpoint = `${url.hostname}:${port}`;
  const key = `${encodeURIComponent(username)}@${endpoint}/${encodeURIComponent(database)}?schema=${encodeURIComponent(schema)}`;
  return { key, database, username, schema, endpoint };
}
