import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaProfileRepository } from './profile.service.js';

const enabled = process.env.RUN_PROFILE_INTEGRATION_TESTS === '1';

describe.skipIf(!enabled)('own profile PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let repository: PrismaProfileRepository;
  const userId = `profile-test-${randomUUID()}`;
  const otherUserId = `profile-test-${randomUUID()}`;
  const cascadeUserId = `profile-test-${randomUUID()}`;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getProfileTestDatabaseUrl() }),
    });
    repository = new PrismaProfileRepository(prisma);
    await prisma.$queryRaw`SELECT 1`;
    await prisma.user.createMany({
      data: [userId, otherUserId, cascadeUserId].map((id) => ({
        id,
        name: `Profile test ${id.slice(-6)}`,
        email: `${id}@example.test`,
      })),
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId, cascadeUserId] } } });
    await prisma.$disconnect();
  });

  it('returns defaults when no profile row exists', async () => {
    const profile = await repository.find(userId);
    expect(profile).toEqual({
      name: expect.stringMatching(/^Profile test /),
      bio: null,
      avatar: { kind: 'initials' },
    });
    expect(await prisma.userProfile.count({ where: { userId } })).toBe(0);
  });

  it('returns null for unknown users', async () => {
    expect(await repository.find(`missing-${randomUUID()}`)).toBeNull();
    expect(await repository.update(`missing-${randomUUID()}`, { name: 'Nadie' })).toBeNull();
  });

  it('updates the name without creating a profile row', async () => {
    const result = await repository.update(userId, { name: 'Ana' });
    expect(result).toMatchObject({ name: 'Ana', bio: null });
    expect(await prisma.userProfile.count({ where: { userId } })).toBe(0);
  });

  it('creates the profile row on first bio and keeps it when clearing', async () => {
    expect(await repository.update(userId, { bio: 'Cine y series' })).toMatchObject({
      name: 'Ana',
      bio: 'Cine y series',
    });
    expect(await repository.update(userId, { bio: null })).toMatchObject({ bio: null });
    const row = await prisma.userProfile.findUniqueOrThrow({ where: { userId } });
    expect(row).toMatchObject({ bio: null, avatarKind: 'initials', avatarKey: null });
  });

  it('isolates users', async () => {
    const before = await repository.find(otherUserId);
    await repository.update(userId, { name: 'Ana otra vez', bio: 'Solo mío' });
    expect(await repository.find(otherUserId)).toEqual(before);
  });

  it('enforces the bio length and avatar constraints in PostgreSQL', async () => {
    await expect(
      prisma.userProfile.update({ where: { userId }, data: { bio: 'x'.repeat(301) } }),
    ).rejects.toThrow();
    await expect(
      prisma.userProfile.update({ where: { userId }, data: { avatarKind: 'preset' } }),
    ).rejects.toThrow();
    await expect(
      prisma.userProfile.update({ where: { userId }, data: { avatarKind: 'gravatar' } }),
    ).rejects.toThrow();
  });

  it('deletes the profile when the user is deleted', async () => {
    await repository.update(cascadeUserId, { bio: 'Temporal' });
    await prisma.user.delete({ where: { id: cascadeUserId } });
    expect(await prisma.userProfile.count({ where: { userId: cascadeUserId } })).toBe(0);
  });
});

function getProfileTestDatabaseUrl(): string {
  const value = process.env.PROFILE_TEST_DATABASE_URL;
  if (!value) {
    throw new Error('PROFILE_TEST_DATABASE_URL must point to an isolated local test database.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PROFILE_TEST_DATABASE_URL must be a PostgreSQL URL.');
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  const isTestDatabase = database.endsWith('_profile_test') || database.endsWith('_auth_test');
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
    !isTestDatabase ||
    !['postgres:', 'postgresql:'].includes(url.protocol)
  ) {
    throw new Error(
      'Profile integration tests are restricted to loopback *_profile_test or *_auth_test databases.',
    );
  }
  return value;
}
