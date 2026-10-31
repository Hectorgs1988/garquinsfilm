import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient } from '../db/client.js';
import { LibraryDuplicateEntryError, PrismaLibraryRepository } from './library.service.js';

const enabled = process.env.RUN_LIBRARY_INTEGRATION_TESTS === '1';

describe.skipIf(!enabled)('personal library PostgreSQL integration', () => {
  const prisma = getPrismaClient();
  const repository = new PrismaLibraryRepository(prisma);
  const suffix = Date.now() % 1_000_000_000;
  const userId = `library-test-${randomUUID()}`;
  const secondUserId = `library-test-${randomUUID()}`;
  const tmdbId = suffix + 1;
  const tvTmdbId = suffix + 2;
  const secondTvTmdbId = suffix + 3;

  beforeAll(async () => {
    if (!process.env.LIBRARY_TEST_DATABASE_URL) {
      throw new Error('LIBRARY_TEST_DATABASE_URL is required for library integration tests.');
    }
    await prisma.user.createMany({
      data: [
        {
          id: userId,
          name: 'Library integration test',
          email: `${userId}@example.test`,
        },
        {
          id: secondUserId,
          name: 'Library integration test second user',
          email: `${secondUserId}@example.test`,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.libraryEntry.deleteMany({ where: { userId: { in: [userId, secondUserId] } } });
    await prisma.media.deleteMany({
      where: { tmdbId: { in: [tmdbId, tvTmdbId, secondTvTmdbId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userId, secondUserId] } } });
    await prisma.$disconnect();
  });

  it('enforces concurrent uniqueness, defaults and non-destructive entry deletion', async () => {
    const attempts = await Promise.allSettled([
      repository.create(userId, { source: 'tmdb', type: 'movie', tmdbId }),
      repository.create(userId, { source: 'tmdb', type: 'movie', tmdbId }),
    ]);

    const created = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof repository.create>>> =>
        attempt.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected',
    );

    expect(created).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(LibraryDuplicateEntryError);
    expect(created[0].value.status).toBe('PENDING');
    expect(created[0].value.isFavorite).toBe(false);
    expect(created[0].value.media).toBeNull();

    const secondUserEntry = await repository.create(secondUserId, {
      source: 'tmdb',
      type: 'movie',
      tmdbId,
    });
    expect(secondUserEntry.id).not.toBe(created[0].value.id);
    expect(await repository.find(secondUserId, created[0].value.id)).toBeNull();
    expect(
      await repository.list(secondUserId, {
        page: 1,
        pageSize: 20,
        sortBy: 'addedAt',
        sortOrder: 'desc',
      }),
    ).toMatchObject({ totalResults: 1, results: [{ id: secondUserEntry.id }] });

    const tvEntry = await repository.create(userId, {
      source: 'tmdb',
      type: 'tv',
      tmdbId: tvTmdbId,
      status: 'WATCHING',
      isFavorite: true,
    });
    const secondTvEntry = await repository.create(userId, {
      source: 'tmdb',
      type: 'tv',
      tmdbId: secondTvTmdbId,
      status: 'WATCHING',
      isFavorite: true,
    });
    const stableDate = new Date('2026-01-01T00:00:00.000Z');
    await prisma.libraryEntry.updateMany({
      where: { id: { in: [tvEntry.id, secondTvEntry.id] } },
      data: { addedAt: stableDate },
    });
    const firstPage = await repository.list(userId, {
      type: 'tv',
      status: 'WATCHING',
      favorite: true,
      page: 1,
      pageSize: 1,
      sortBy: 'addedAt',
      sortOrder: 'asc',
    });
    const secondPage = await repository.list(userId, {
      type: 'tv',
      status: 'WATCHING',
      favorite: true,
      page: 2,
      pageSize: 1,
      sortBy: 'addedAt',
      sortOrder: 'asc',
    });
    expect(firstPage.totalResults).toBe(2);
    expect(firstPage.totalPages).toBe(2);
    expect(firstPage.results).toHaveLength(1);
    expect(secondPage.results).toHaveLength(1);
    expect([firstPage.results[0].id, secondPage.results[0].id]).toEqual(
      [tvEntry.id, secondTvEntry.id].sort(),
    );
    const emptyPage = await repository.list(userId, {
      status: 'ABANDONED',
      page: 1,
      pageSize: 20,
      sortBy: 'addedAt',
      sortOrder: 'desc',
    });
    expect(emptyPage).toMatchObject({ totalPages: 0, totalResults: 0, results: [] });

    const firstCompletion = await repository.update(userId, created[0].value.id, {
      status: 'COMPLETED',
    });
    expect(firstCompletion?.completedAt).not.toBeNull();
    const completedAt = firstCompletion?.completedAt;

    const favoriteOnly = await repository.update(userId, created[0].value.id, {
      isFavorite: true,
    });
    expect(favoriteOnly?.completedAt).toBe(completedAt);
    expect(favoriteOnly?.isFavorite).toBe(true);

    const reopened = await repository.update(userId, created[0].value.id, {
      status: 'WATCHING',
    });
    expect(reopened?.completedAt).toBeNull();
    expect(reopened?.isFavorite).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const completedAgain = await repository.update(userId, created[0].value.id, {
      status: 'COMPLETED',
    });
    expect(completedAgain?.completedAt).not.toBeNull();
    expect(completedAgain?.completedAt).not.toBe(completedAt);

    const concurrentUpdates = await Promise.allSettled([
      repository.update(userId, created[0].value.id, { status: 'ABANDONED' }),
      repository.update(userId, created[0].value.id, { status: 'PENDING' }),
    ]);
    expect(concurrentUpdates.some((result) => result.status === 'fulfilled')).toBe(true);
    for (const result of concurrentUpdates) {
      if (result.status === 'rejected') {
        expect(result.reason).toMatchObject({ name: 'LibraryUpdateConflictError' });
      }
    }
    const finalEntry = await repository.find(userId, created[0].value.id);
    expect(finalEntry?.status).toMatch(/^(ABANDONED|PENDING)$/);
    expect(finalEntry?.completedAt).toBeNull();

    expect(await repository.delete(userId, created[0].value.id)).toBe(true);
    expect(await repository.find(userId, created[0].value.id)).toBeNull();
    expect(await prisma.media.count({ where: { tmdbId } })).toBe(1);

    await expect(
      prisma.media.delete({
        where: {
          source_type_tmdbId: { source: 'tmdb', type: 'movie', tmdbId },
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    await prisma.user.delete({ where: { id: secondUserId } });
    expect(await repository.find(secondUserId, secondUserEntry.id)).toBeNull();
    expect(await prisma.media.count({ where: { tmdbId } })).toBe(1);
  });

  it('enforces positive external identifiers and completion timestamp consistency in PostgreSQL', async () => {
    await expect(
      prisma.media.create({
        data: { source: 'tmdb', type: 'tv', tmdbId: -tmdbId },
      }),
    ).rejects.toMatchObject({ code: 'P2039' });

    const media = await prisma.media.findUniqueOrThrow({
      where: {
        source_type_tmdbId: { source: 'tmdb', type: 'movie', tmdbId },
      },
      select: { id: true },
    });
    await expect(
      prisma.libraryEntry.create({
        data: {
          userId,
          mediaId: media.id,
          status: 'COMPLETED',
          completedAt: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2039' });
  });
});
