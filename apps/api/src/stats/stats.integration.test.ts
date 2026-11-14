import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaStatsRepository } from './stats.service.js';

const enabled = process.env.RUN_STATS_INTEGRATION_TESTS === '1';

describe.skipIf(!enabled)('profile stats PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let repository: PrismaStatsRepository;
  const suffix = Date.now() % 1_000_000_000;
  const userId = `stats-test-${randomUUID()}`;
  const otherUserId = `stats-test-${randomUUID()}`;
  const mediaIds: string[] = [];

  async function addEntry(
    ownerId: string,
    type: 'movie' | 'tv',
    status: 'PENDING' | 'WATCHING' | 'COMPLETED' | 'ABANDONED',
    scoreTenths?: number | null,
  ) {
    const media = await prisma.media.create({
      data: {
        id: `stats-media-${randomUUID()}`,
        source: 'tmdb',
        type,
        tmdbId: suffix + mediaIds.length + 1,
      },
    });
    mediaIds.push(media.id);
    const entry = await prisma.libraryEntry.create({
      data: {
        id: `stats-entry-${randomUUID()}`,
        userId: ownerId,
        mediaId: media.id,
        status,
        // `library_entry_completedAt_consistent` exige la fecha solo en COMPLETED.
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
    });
    if (scoreTenths !== undefined) {
      await prisma.rating.create({
        data: {
          id: `stats-rating-${randomUUID()}`,
          libraryEntryId: entry.id,
          scoreTenths,
          review: scoreTenths === null ? 'Solo reseña' : null,
        },
      });
    }
    return entry;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getStatsTestDatabaseUrl() }),
    });
    repository = new PrismaStatsRepository(prisma);
    await prisma.$queryRaw`SELECT 1`;
    await prisma.user.createMany({
      data: [userId, otherUserId].map((id) => ({
        id,
        name: `Stats test ${id.slice(-6)}`,
        email: `${id}@example.test`,
      })),
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.libraryEntry.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.media.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it('returns zeros and no average for an empty library', async () => {
    expect(await repository.summary(userId)).toEqual({
      movies: { completed: 0, pending: 0 },
      series: { completed: 0, pending: 0 },
      ratings: { average: null, count: 0 },
    });
  });

  it('counts titles by type and status, ignoring watching and abandoned', async () => {
    await addEntry(userId, 'movie', 'COMPLETED');
    await addEntry(userId, 'movie', 'COMPLETED');
    await addEntry(userId, 'movie', 'PENDING');
    await addEntry(userId, 'movie', 'WATCHING');
    await addEntry(userId, 'movie', 'ABANDONED');
    await addEntry(userId, 'tv', 'COMPLETED');
    await addEntry(userId, 'tv', 'PENDING');
    await addEntry(userId, 'tv', 'PENDING');

    const summary = await repository.summary(userId);
    expect(summary.movies).toEqual({ completed: 2, pending: 1 });
    expect(summary.series).toEqual({ completed: 1, pending: 2 });
  });

  it('averages only the entries that carry a score', async () => {
    await addEntry(userId, 'movie', 'COMPLETED', 80);
    await addEntry(userId, 'movie', 'COMPLETED', 90);
    await addEntry(userId, 'tv', 'COMPLETED', null); // reseña sin nota
    await addEntry(userId, 'tv', 'COMPLETED', 0); // el cero sí cuenta

    const { ratings } = await repository.summary(userId);
    expect(ratings.count).toBe(3);
    expect(ratings.average).toBe(5.7); // (80 + 90 + 0) / 3 = 56,67 décimas
  });

  it('does not mix data from other users', async () => {
    await addEntry(otherUserId, 'movie', 'COMPLETED', 100);
    await addEntry(otherUserId, 'tv', 'PENDING');

    expect(await repository.summary(otherUserId)).toEqual({
      movies: { completed: 1, pending: 0 },
      series: { completed: 0, pending: 1 },
      ratings: { average: 10, count: 1 },
    });

    const mine = await repository.summary(userId);
    expect(mine.movies.completed).toBe(4);
    expect(mine.ratings.count).toBe(3);
  });
});

function getStatsTestDatabaseUrl(): string {
  const value = process.env.STATS_TEST_DATABASE_URL;
  if (!value) {
    throw new Error('STATS_TEST_DATABASE_URL must point to an isolated local test database.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('STATS_TEST_DATABASE_URL must be a PostgreSQL URL.');
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  const isTestDatabase = database.endsWith('_stats_test') || database.endsWith('_auth_test');
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
    !isTestDatabase ||
    !['postgres:', 'postgresql:'].includes(url.protocol)
  ) {
    throw new Error(
      'Stats integration tests are restricted to loopback *_stats_test or *_auth_test databases.',
    );
  }
  return value;
}