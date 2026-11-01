import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaRatingRepository } from './ratings.service.js';

const enabled = process.env.RUN_RATINGS_INTEGRATION_TESTS === '1';

describe.skipIf(!enabled)('personal ratings PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let repository: PrismaRatingRepository;
  const suffix = Date.now() % 1_000_000_000;
  const userId = `ratings-test-${randomUUID()}`;
  const secondUserId = `ratings-test-${randomUUID()}`;
  const mediaId = `ratings-media-${randomUUID()}`;
  const secondMediaId = `ratings-media-${randomUUID()}`;
  const libraryEntryIds: string[] = [];

  beforeAll(async () => {
    const connectionString = getRatingsTestDatabaseUrl();
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    repository = new PrismaRatingRepository(prisma);
    await prisma.$queryRaw`SELECT 1`;
    await prisma.user.createMany({
      data: [
        { id: userId, name: 'Ratings integration test', email: `${userId}@example.test` },
        {
          id: secondUserId,
          name: 'Ratings integration test second user',
          email: `${secondUserId}@example.test`,
        },
      ],
    });
    await prisma.media.create({
      data: { id: mediaId, source: 'tmdb', type: 'movie', tmdbId: suffix + 1 },
    });
    await prisma.media.create({
      data: { id: secondMediaId, source: 'tmdb', type: 'tv', tmdbId: suffix + 2 },
    });
    for (const [ownerId, contentId] of [
      [userId, mediaId],
      [secondUserId, mediaId],
      [userId, secondMediaId],
    ]) {
      const entry = await prisma.libraryEntry.create({
        data: { id: `rating-entry-${randomUUID()}`, userId: ownerId, mediaId: contentId },
        select: { id: true },
      });
      libraryEntryIds.push(entry.id);
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.libraryEntry.deleteMany({ where: { id: { in: libraryEntryIds } } });
    await prisma.media.deleteMany({ where: { id: { in: [mediaId, secondMediaId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, secondUserId] } } });
    await prisma.$disconnect();
  });

  it('creates, replaces, reads and deletes a private rating without changing its library entry', async () => {
    const entryId = libraryEntryIds[0];
    const originalEntry = await prisma.libraryEntry.findUniqueOrThrow({
      where: { id: entryId },
      select: { updatedAt: true, status: true, isFavorite: true },
    });
    expect(await repository.find(userId, entryId)).toEqual({ entryExists: true, rating: null });
    expect(await repository.find(secondUserId, entryId)).toEqual({
      entryExists: false,
      rating: null,
    });
    expect(
      await repository.set(secondUserId, entryId, {
        score: 10,
        review: null,
        containsSpoilers: false,
      }),
    ).toBeNull();
    expect(await repository.delete(secondUserId, entryId)).toBe(false);

    const created = await repository.set(userId, entryId, {
      score: 0,
      review: null,
      containsSpoilers: false,
    });
    expect(created).toMatchObject({ created: true, rating: { score: 0, review: null } });

    const replaced = await repository.set(userId, entryId, {
      score: null,
      review: 'Texto privado\n😀',
      containsSpoilers: true,
    });
    expect(replaced).toMatchObject({
      created: false,
      rating: { score: null, review: 'Texto privado\n😀', containsSpoilers: true },
    });
    expect(await repository.find(secondUserId, entryId)).toEqual({
      entryExists: false,
      rating: null,
    });

    const afterRating = await prisma.libraryEntry.findUniqueOrThrow({
      where: { id: entryId },
      select: { updatedAt: true, status: true, isFavorite: true },
    });
    expect(afterRating).toEqual(originalEntry);

    expect(await repository.delete(userId, entryId)).toBe(true);
    expect(await repository.delete(userId, entryId)).toBe(true);
    expect(await repository.find(userId, entryId)).toEqual({ entryExists: true, rating: null });
    expect(await prisma.libraryEntry.findUnique({ where: { id: entryId } })).not.toBeNull();
  });

  it.each([0, 0.1, 7.8, 10])('round-trips score %s through PostgreSQL', async (score) => {
    const entryId = libraryEntryIds[0];
    await repository.set(userId, entryId, {
      score,
      review: null,
      containsSpoilers: false,
    });

    expect((await repository.find(userId, entryId)).rating?.score).toBe(score);
    await repository.delete(userId, entryId);
  });

  it('accepts successive rating updates when they are not overlapping', async () => {
    const entryId = libraryEntryIds[0];
    await repository.set(userId, entryId, {
      score: 5,
      review: null,
      containsSpoilers: false,
    });

    const first = await repository.set(userId, entryId, {
      score: 6,
      review: null,
      containsSpoilers: false,
    });
    const second = await repository.set(userId, entryId, {
      score: 7,
      review: null,
      containsSpoilers: false,
    });

    expect(first?.created).toBe(false);
    expect(second?.created).toBe(false);
    expect((await repository.find(userId, entryId)).rating?.score).toBe(7);
  });

  it('serializes concurrent upserts without duplicate rows or an unreported write conflict', async () => {
    const entryId = libraryEntryIds[2];
    const attempts = await Promise.allSettled([
      repository.set(userId, entryId, {
        score: 6.5,
        review: null,
        containsSpoilers: false,
      }),
      repository.set(userId, entryId, {
        score: 9.5,
        review: null,
        containsSpoilers: false,
      }),
    ]);
    const successful = attempts.filter(
      (
        attempt,
      ): attempt is PromiseFulfilledResult<
        NonNullable<Awaited<ReturnType<typeof repository.set>>>
      > => attempt.status === 'fulfilled' && attempt.value !== null,
    );
    expect(successful.length).toBeGreaterThanOrEqual(1);
    for (const attempt of attempts) {
      if (attempt.status === 'rejected') {
        expect(attempt.reason).toMatchObject({ name: 'RatingConflictError' });
      }
    }

    const ratingCount = await prisma.rating.count({ where: { libraryEntryId: entryId } });
    expect(ratingCount).toBe(1);
    const final = await repository.find(userId, entryId);
    expect([6.5, 9.5]).toContain(final.rating?.score);
  });

  it('reports a conflict instead of silently overwriting a concurrent rating update', async () => {
    const entryId = libraryEntryIds[0];
    await repository.set(userId, entryId, {
      score: 5,
      review: null,
      containsSpoilers: false,
    });

    const lockClient = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getRatingsTestDatabaseUrl() }),
    });
    let releaseRowLock!: () => void;
    let signalRowLocked!: () => void;
    const rowLockReleased = new Promise<void>((resolve) => {
      releaseRowLock = resolve;
    });
    const rowLocked = new Promise<void>((resolve) => {
      signalRowLocked = resolve;
    });
    const lockTransaction = lockClient.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "rating" WHERE "libraryEntryId" = ${entryId} FOR UPDATE`;
        signalRowLocked();
        await rowLockReleased;
      },
      { timeout: 30_000 },
    );
    let attemptsPromise:
      Promise<PromiseSettledResult<Awaited<ReturnType<typeof repository.set>>>[]> | undefined;

    try {
      await Promise.race([
        rowLocked,
        lockTransaction.then(() => {
          throw new Error('The rating lock transaction ended before acquiring its row lock.');
        }),
      ]);

      attemptsPromise = Promise.allSettled([
        repository.set(userId, entryId, {
          score: 6,
          review: null,
          containsSpoilers: false,
        }),
        repository.set(userId, entryId, {
          score: 7,
          review: null,
          containsSpoilers: false,
        }),
      ]);
      await waitForBlockedRatingUpdates(prisma, 2);
      releaseRowLock();

      const attempts = await attemptsPromise;
      const successful = attempts.filter((attempt) => attempt.status === 'fulfilled');
      const rejected = attempts.filter(
        (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected',
      );

      expect(successful).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ name: 'RatingConflictError' });
    } finally {
      releaseRowLock();
      try {
        await lockTransaction;
        if (attemptsPromise) await attemptsPromise;
      } finally {
        await lockClient.$disconnect();
      }
    }

    expect([6, 7]).toContain((await repository.find(userId, entryId)).rating?.score);
  }, 20_000);

  it('enforces database constraints, uniqueness and cascade deletion', async () => {
    const entryId = libraryEntryIds[1];
    await prisma.rating.deleteMany({ where: { libraryEntryId: libraryEntryIds[0] } });
    await repository.set(secondUserId, entryId, {
      score: 10,
      review: 'Nota máxima',
      containsSpoilers: false,
    });

    const rejectedRows = [
      { scoreTenths: -1, review: null, containsSpoilers: false },
      { scoreTenths: 101, review: null, containsSpoilers: false },
      { scoreTenths: null, review: null, containsSpoilers: false },
      { scoreTenths: null, review: '', containsSpoilers: false },
      { scoreTenths: null, review: '   ', containsSpoilers: false },
      { scoreTenths: null, review: '\u2003', containsSpoilers: false },
      { scoreTenths: null, review: '😀'.repeat(2_001), containsSpoilers: false },
      { scoreTenths: 80, review: null, containsSpoilers: true },
      { scoreTenths: null, review: null, containsSpoilers: true },
    ];
    for (const row of rejectedRows) {
      await expect(
        prisma.rating.create({
          data: {
            libraryEntryId: libraryEntryIds[0],
            scoreTenths: row.scoreTenths,
            review: row.review,
            containsSpoilers: row.containsSpoilers,
          },
        }),
      ).rejects.toBeDefined();
    }

    const unicodeBoundaryRating = await prisma.rating.create({
      data: {
        libraryEntryId: libraryEntryIds[0],
        scoreTenths: null,
        review: '😀'.repeat(2_000),
        containsSpoilers: false,
      },
    });
    expect(unicodeBoundaryRating.review).toHaveLength(4_000);
    await prisma.rating.delete({ where: { libraryEntryId: libraryEntryIds[0] } });

    const combiningCharactersRating = await prisma.rating.create({
      data: {
        libraryEntryId: libraryEntryIds[0],
        scoreTenths: null,
        review: 'e\u0301'.repeat(1_000),
        containsSpoilers: false,
      },
    });
    expect(combiningCharactersRating.review).toHaveLength(2_000);
    expect([...combiningCharactersRating.review!]).toHaveLength(2_000);
    await prisma.rating.delete({ where: { libraryEntryId: libraryEntryIds[0] } });

    await expect(
      prisma.rating.create({
        data: {
          libraryEntryId: entryId,
          scoreTenths: 87,
          review: null,
          containsSpoilers: false,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.libraryEntry.delete({ where: { id: entryId } });
    expect(await prisma.rating.count({ where: { libraryEntryId: entryId } })).toBe(0);
    expect(await prisma.media.findUnique({ where: { id: mediaId } })).not.toBeNull();
  });
});

function getRatingsTestDatabaseUrl(): string {
  const value = process.env.RATINGS_TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      'RATINGS_TEST_DATABASE_URL must point to an isolated local ratings test database.',
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('RATINGS_TEST_DATABASE_URL must be a PostgreSQL URL.');
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  const isTestDatabase = database.endsWith('_ratings_test') || database.endsWith('_auth_test');
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
    !isTestDatabase ||
    !['postgres:', 'postgresql:'].includes(url.protocol)
  ) {
    throw new Error(
      'Ratings integration tests are restricted to loopback *_ratings_test or *_auth_test databases.',
    );
  }
  return value;
}

async function waitForBlockedRatingUpdates(
  prisma: PrismaClient,
  expectedCount: number,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  let blockedQueries: string[] = [];
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<{ query: string }[]>`
      SELECT query
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND usename = current_user
        AND pid <> pg_backend_pid()
        AND state = 'active'
        AND wait_event_type = 'Lock'
    `;
    blockedQueries = rows.map((row) => row.query);
    const ratingUpdates = blockedQueries.filter(
      (query) => query.toLowerCase().includes('update') && query.toLowerCase().includes('rating'),
    );
    if (ratingUpdates.length >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `Expected ${expectedCount} blocked rating updates, observed queries: ${blockedQueries.join(' | ')}`,
  );
}
