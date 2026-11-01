import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { SEASON_PROGRESS_MAX_PER_ENTRY } from '@garquinsfilm/shared';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaSeasonProgressRepository } from './season-progress.service.js';

const enabled = process.env.RUN_SEASON_PROGRESS_INTEGRATION_TESTS === '1';

describe.skipIf(!enabled)('season progress PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let repository: PrismaSeasonProgressRepository;
  const userId = `season-test-${randomUUID()}`;
  const secondUserId = `season-test-${randomUUID()}`;
  const mediaIds: string[] = [];
  // Disjoint from the Date.now()-based ranges (< 1e9) that other integration suites use in parallel.
  let nextTmdbId = 1_100_000_000 + Math.floor(Math.random() * 900_000_000);

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getSeasonTestDatabaseUrl() }),
    });
    repository = new PrismaSeasonProgressRepository(prisma);
    await prisma.$queryRaw`SELECT 1`;
    await prisma.user.createMany({
      data: [userId, secondUserId].map((id) => ({
        id,
        name: 'Season progress integration test',
        email: `${id}@example.test`,
      })),
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { id: { in: [userId, secondUserId] } } });
    await prisma.media.deleteMany({ where: { id: { in: mediaIds } } });
    await prisma.$disconnect();
  });

  // Entries are unique per (user, media), so each entry gets its own media row.
  async function createEntry(ownerId = userId, type: 'tv' | 'movie' = 'tv'): Promise<string> {
    nextTmdbId += 1;
    const media = await prisma.media.create({
      data: { id: `season-media-${randomUUID()}`, source: 'tmdb', type, tmdbId: nextTmdbId },
      select: { id: true },
    });
    mediaIds.push(media.id);
    const entry = await prisma.libraryEntry.create({
      data: { id: `season-entry-${randomUUID()}`, userId: ownerId, mediaId: media.id },
      select: { id: true },
    });
    return entry.id;
  }

  async function seasonNumbers(entryId: string): Promise<number[]> {
    const rows = await prisma.seasonProgress.findMany({
      where: { libraryEntryId: entryId },
      select: { seasonNumber: true },
      orderBy: { seasonNumber: 'asc' },
    });
    return rows.map((row) => row.seasonNumber);
  }

  // Holds the entry row lock the repository uses, so queued operations overlap deterministically.
  async function holdEntryLock(
    entryId: string,
    whileLocked?: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    const done = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "library_entry" WHERE "id" = ${entryId} FOR UPDATE`;
        signalLocked();
        await released;
        await whileLocked?.(tx);
      },
      { timeout: 30_000 },
    );
    await Promise.race([locked, done]);
    return { release, done };
  }

  async function waitForBlockedWriters(count: number): Promise<void> {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const [row] = await prisma.$queryRaw<{ blocked: number }[]>`
        SELECT count(*)::int AS blocked FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE '%FOR UPDATE OF e%'`;
      if (row.blocked >= count) return;
      if (Date.now() > deadline) throw new Error(`Only ${row.blocked}/${count} writers blocked.`);
      await delay(10);
    }
  }

  it('applies the migration constraints: unique, 0-9999 check and cascade foreign key', async () => {
    const entryId = await createEntry();
    const insert = (seasonNumber: number, libraryEntryId = entryId) =>
      prisma.$executeRaw`INSERT INTO "season_progress" ("id", "libraryEntryId", "seasonNumber")
        VALUES (${randomUUID()}, ${libraryEntryId}, ${seasonNumber})`;

    await insert(0);
    await insert(9999);
    await expect(insert(-1)).rejects.toThrow();
    await expect(insert(10000)).rejects.toThrow();
    await expect(insert(0)).rejects.toThrow();
    await expect(insert(1, 'missing-entry')).rejects.toThrow();
    expect(await seasonNumbers(entryId)).toEqual([0, 9999]);

    await prisma.libraryEntry.delete({ where: { id: entryId } });
    expect(await seasonNumbers(entryId)).toEqual([]);
  });

  it('marks, repeats and unmarks seasons idempotently, keeping the original completedAt', async () => {
    const entryId = await createEntry();
    expect(await repository.list(userId, entryId)).toEqual({
      kind: 'ok',
      value: { libraryEntryId: entryId, completedSeasons: [] },
    });

    const first = await repository.complete(userId, entryId, 2);
    expect(first).toMatchObject({ kind: 'ok', value: { created: true } });
    await delay(5);
    const repeated = await repository.complete(userId, entryId, 2);
    expect(repeated).toMatchObject({ kind: 'ok', value: { created: false } });
    expect(repeated.kind === 'ok' && repeated.value.season).toEqual(
      first.kind === 'ok' && first.value.season,
    );

    expect(await repository.complete(userId, entryId, 0)).toMatchObject({
      kind: 'ok',
      value: { created: true },
    });
    const listed = await repository.list(userId, entryId);
    expect(
      listed.kind === 'ok' && listed.value.completedSeasons.map((s) => s.seasonNumber),
    ).toEqual([0, 2]);

    expect(await repository.uncomplete(userId, entryId, 2)).toEqual({ kind: 'ok', value: null });
    expect(await repository.uncomplete(userId, entryId, 2)).toEqual({ kind: 'ok', value: null });
    expect(await repository.uncomplete(userId, entryId, 77)).toEqual({ kind: 'ok', value: null });
    expect(await seasonNumbers(entryId)).toEqual([0]);
  });

  it('keeps users isolated and answers not_found identically for foreign or missing entries', async () => {
    const ownEntry = await createEntry(userId);
    const otherEntry = await createEntry(secondUserId);

    await repository.complete(userId, ownEntry, 1);
    await repository.complete(secondUserId, otherEntry, 3);

    expect(await seasonNumbers(ownEntry)).toEqual([1]);
    expect(await seasonNumbers(otherEntry)).toEqual([3]);

    for (const entryId of [otherEntry, 'does-not-exist']) {
      expect(await repository.list(userId, entryId)).toEqual({ kind: 'not_found' });
      expect(await repository.complete(userId, entryId, 5)).toEqual({ kind: 'not_found' });
      expect(await repository.uncomplete(userId, entryId, 3)).toEqual({ kind: 'not_found' });
      expect(
        await repository.applyBatch(userId, entryId, { complete: [5], uncomplete: [] }),
      ).toEqual({ kind: 'not_found' });
    }
    expect(await seasonNumbers(otherEntry)).toEqual([3]);
  });

  it('rejects movie entries without writing anything', async () => {
    const movieEntry = await createEntry(userId, 'movie');
    expect(await repository.list(userId, movieEntry)).toEqual({ kind: 'not_series' });
    expect(await repository.complete(userId, movieEntry, 1)).toEqual({ kind: 'not_series' });
    expect(await repository.uncomplete(userId, movieEntry, 1)).toEqual({ kind: 'not_series' });
    expect(
      await repository.applyBatch(userId, movieEntry, { complete: [1], uncomplete: [] }),
    ).toEqual({ kind: 'not_series' });
    expect(await seasonNumbers(movieEntry)).toEqual([]);
  });

  it('does not touch library entry fields, favourites or ratings', async () => {
    const entryId = await createEntry();
    await prisma.libraryEntry.update({
      where: { id: entryId },
      data: {
        status: 'COMPLETED',
        isFavorite: true,
        completedAt: new Date('2026-10-01T10:00:00Z'),
      },
    });
    await prisma.rating.create({
      data: { libraryEntryId: entryId, scoreTenths: 87, review: 'Privada', containsSpoilers: true },
    });
    const selectEntry = () =>
      prisma.libraryEntry.findUniqueOrThrow({
        where: { id: entryId },
        include: { rating: true },
      });
    const before = await selectEntry();

    await repository.complete(userId, entryId, 1);
    await repository.applyBatch(userId, entryId, { complete: [2, 3], uncomplete: [1] });
    await repository.uncomplete(userId, entryId, 2);

    expect(await selectEntry()).toEqual(before);
    expect(await seasonNumbers(entryId)).toEqual([3]);
  });

  it('applies batches atomically, idempotently and returns the final ordered list', async () => {
    const entryId = await createEntry();
    const view = (seasons: number[]) => seasons;
    const result = await repository.applyBatch(userId, entryId, {
      complete: [3, 1, 0],
      uncomplete: [9],
    });
    expect(
      result.kind === 'ok' && view(result.value.completedSeasons.map((s) => s.seasonNumber)),
    ).toEqual([0, 1, 3]);
    const original = result.kind === 'ok' ? result.value.completedSeasons : [];

    const again = await repository.applyBatch(userId, entryId, {
      complete: [3, 1, 0],
      uncomplete: [9],
    });
    expect(again.kind === 'ok' && again.value.completedSeasons).toEqual(original);

    const mixed = await repository.applyBatch(userId, entryId, { complete: [2], uncomplete: [1] });
    expect(mixed.kind === 'ok' && mixed.value.completedSeasons.map((s) => s.seasonNumber)).toEqual([
      0, 2, 3,
    ]);
    // Surviving seasons keep their original completedAt.
    expect(mixed.kind === 'ok' && mixed.value.completedSeasons[0]).toEqual(original[0]);
  });

  it('enforces the 500-season limit without partial batches and allows net-zero changes', async () => {
    const entryId = await createEntry();
    await prisma.seasonProgress.createMany({
      data: Array.from({ length: SEASON_PROGRESS_MAX_PER_ENTRY - 1 }, (_, seasonNumber) => ({
        libraryEntryId: entryId,
        seasonNumber,
      })),
    });

    expect(await repository.complete(userId, entryId, 1000)).toMatchObject({
      kind: 'ok',
      value: { created: true },
    });
    expect(await seasonNumbers(entryId)).toHaveLength(SEASON_PROGRESS_MAX_PER_ENTRY);

    expect(await repository.complete(userId, entryId, 1001)).toEqual({ kind: 'limit_reached' });
    expect(await repository.complete(userId, entryId, 1000)).toMatchObject({
      kind: 'ok',
      value: { created: false },
    });
    expect(
      await repository.applyBatch(userId, entryId, { complete: [2000, 2001], uncomplete: [0] }),
    ).toEqual({ kind: 'limit_reached' });
    expect(await seasonNumbers(entryId)).toHaveLength(SEASON_PROGRESS_MAX_PER_ENTRY);
    expect((await seasonNumbers(entryId))[0]).toBe(0);

    const swapped = await repository.applyBatch(userId, entryId, {
      complete: [2000],
      uncomplete: [0],
    });
    expect(swapped.kind).toBe('ok');
    expect(await seasonNumbers(entryId)).toHaveLength(SEASON_PROGRESS_MAX_PER_ENTRY);
  });

  it('never exceeds 500 seasons when several additions overlap', async () => {
    const entryId = await createEntry();
    await prisma.seasonProgress.createMany({
      data: Array.from({ length: SEASON_PROGRESS_MAX_PER_ENTRY - 2 }, (_, seasonNumber) => ({
        libraryEntryId: entryId,
        seasonNumber,
      })),
    });

    const lock = await holdEntryLock(entryId);
    const attempts = [1000, 1001, 1002, 1003, 1004].map((seasonNumber) =>
      repository.complete(userId, entryId, seasonNumber),
    );
    await waitForBlockedWriters(attempts.length);
    lock.release();
    await lock.done;
    const results = await Promise.all(attempts);

    expect(results.filter((r) => r.kind === 'ok' && r.value.created)).toHaveLength(2);
    expect(results.filter((r) => r.kind === 'limit_reached')).toHaveLength(3);
    expect(await seasonNumbers(entryId)).toHaveLength(SEASON_PROGRESS_MAX_PER_ENTRY);
  });

  it('creates a single row for simultaneous marks of the same season', async () => {
    const entryId = await createEntry();
    const lock = await holdEntryLock(entryId);
    const attempts = Array.from({ length: 6 }, () => repository.complete(userId, entryId, 4));
    await waitForBlockedWriters(attempts.length);
    lock.release();
    await lock.done;
    const results = await Promise.all(attempts);

    expect(results.filter((r) => r.kind === 'ok' && r.value.created)).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'ok' && !r.value.created)).toHaveLength(5);
    expect(await seasonNumbers(entryId)).toEqual([4]);
    const timestamps = new Set(
      results.map((r) => (r.kind === 'ok' ? r.value.season.completedAt : 'error')),
    );
    expect(timestamps.size).toBe(1);
  });

  it('stores simultaneous marks of different seasons without loss', async () => {
    const entryId = await createEntry();
    const lock = await holdEntryLock(entryId);
    const attempts = [1, 2, 3, 4, 5].map((seasonNumber) =>
      repository.complete(userId, entryId, seasonNumber),
    );
    await waitForBlockedWriters(attempts.length);
    lock.release();
    await lock.done;
    await Promise.all(attempts);
    expect(await seasonNumbers(entryId)).toEqual([1, 2, 3, 4, 5]);
  });

  it('resolves opposite operations as a valid sequential order (queue order wins)', async () => {
    const entryId = await createEntry();

    // DELETE queued first, PUT second: PUT must be the final state.
    let lock = await holdEntryLock(entryId);
    const firstDelete = repository.uncomplete(userId, entryId, 6);
    await waitForBlockedWriters(1);
    const thenPut = repository.complete(userId, entryId, 6);
    await waitForBlockedWriters(2);
    lock.release();
    await lock.done;
    expect(await firstDelete).toEqual({ kind: 'ok', value: null });
    expect(await thenPut).toMatchObject({ kind: 'ok', value: { created: true } });
    expect(await seasonNumbers(entryId)).toEqual([6]);

    // PUT queued first, DELETE second: DELETE must be the final state.
    await repository.uncomplete(userId, entryId, 6);
    lock = await holdEntryLock(entryId);
    const firstPut = repository.complete(userId, entryId, 6);
    await waitForBlockedWriters(1);
    const thenDelete = repository.uncomplete(userId, entryId, 6);
    await waitForBlockedWriters(2);
    lock.release();
    await lock.done;
    expect(await firstPut).toMatchObject({ kind: 'ok', value: { created: true } });
    expect(await thenDelete).toEqual({ kind: 'ok', value: null });
    expect(await seasonNumbers(entryId)).toEqual([]);
  });

  it('keeps concurrent batches atomic', async () => {
    const entryId = await createEntry();
    const lock = await holdEntryLock(entryId);
    const first = repository.applyBatch(userId, entryId, { complete: [1, 2, 3], uncomplete: [] });
    await waitForBlockedWriters(1);
    const second = repository.applyBatch(userId, entryId, { complete: [4], uncomplete: [1, 2, 3] });
    await waitForBlockedWriters(2);
    lock.release();
    await lock.done;
    await Promise.all([first, second]);
    expect(await seasonNumbers(entryId)).toEqual([4]);
  });

  it('serialises individual operations with a batch and respects the limit across both', async () => {
    const entryId = await createEntry();
    await prisma.seasonProgress.createMany({
      data: Array.from({ length: SEASON_PROGRESS_MAX_PER_ENTRY - 1 }, (_, seasonNumber) => ({
        libraryEntryId: entryId,
        seasonNumber,
      })),
    });

    const lock = await holdEntryLock(entryId);
    const single = repository.complete(userId, entryId, 2000);
    await waitForBlockedWriters(1);
    const batch = repository.applyBatch(userId, entryId, { complete: [2001], uncomplete: [] });
    await waitForBlockedWriters(2);
    lock.release();
    await lock.done;

    expect(await single).toMatchObject({ kind: 'ok', value: { created: true } });
    expect(await batch).toEqual({ kind: 'limit_reached' });
    const numbers = await seasonNumbers(entryId);
    expect(numbers).toHaveLength(SEASON_PROGRESS_MAX_PER_ENTRY);
    expect(numbers).toContain(2000);
    expect(numbers).not.toContain(2001);
  });

  it('does not block writers of other entries while one entry is locked', async () => {
    const lockedEntry = await createEntry();
    const freeEntry = await createEntry();
    const lock = await holdEntryLock(lockedEntry);
    try {
      expect(await repository.complete(userId, freeEntry, 1)).toMatchObject({
        kind: 'ok',
        value: { created: true },
      });
    } finally {
      lock.release();
      await lock.done;
    }
  });

  it('answers not_found, not a server error, when the entry is deleted while a write is queued', async () => {
    const entryId = await createEntry();
    const lock = await holdEntryLock(entryId, async (tx) => {
      await tx.libraryEntry.delete({ where: { id: entryId } });
    });
    const operations = [
      repository.complete(userId, entryId, 1),
      repository.uncomplete(userId, entryId, 1),
      repository.applyBatch(userId, entryId, { complete: [2], uncomplete: [] }),
    ];
    await waitForBlockedWriters(operations.length);
    lock.release();
    await lock.done;

    expect(await Promise.all(operations)).toEqual([
      { kind: 'not_found' },
      { kind: 'not_found' },
      { kind: 'not_found' },
    ]);
    expect(await seasonNumbers(entryId)).toEqual([]);
  });

  it('delays an entry deletion until an in-flight write finishes, then cascades cleanly', async () => {
    const entryId = await createEntry();
    const lock = await holdEntryLock(entryId, async (tx) => {
      await tx.seasonProgress.create({ data: { libraryEntryId: entryId, seasonNumber: 1 } });
    });
    // Prisma queries are lazy: `.then` starts the deletion immediately.
    const deletion = prisma.$executeRaw`DELETE FROM "library_entry" WHERE "id" = ${entryId}`.then(
      (count) => count,
    );
    try {
      await waitForBlockedDeletion();
    } finally {
      lock.release();
    }
    await lock.done;
    expect(await deletion).toBe(1);
    expect(await seasonNumbers(entryId)).toEqual([]);
  });

  async function waitForBlockedDeletion(): Promise<void> {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const [row] = await prisma.$queryRaw<{ blocked: number }[]>`
        SELECT count(*)::int AS blocked FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query LIKE '%DELETE FROM "library_entry"%'`;
      if (row.blocked >= 1) return;
      if (Date.now() > deadline) throw new Error('The entry deletion was never blocked.');
      await delay(10);
    }
  }
});

function getSeasonTestDatabaseUrl(): string {
  const value = process.env.SEASON_PROGRESS_TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      'SEASON_PROGRESS_TEST_DATABASE_URL must point to an isolated local season progress test database.',
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('SEASON_PROGRESS_TEST_DATABASE_URL must be a PostgreSQL URL.');
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  const isTestDatabase =
    database.endsWith('_season_progress_test') || database.endsWith('_auth_test');
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
    !isTestDatabase ||
    !['postgres:', 'postgresql:'].includes(url.protocol)
  ) {
    throw new Error(
      'Season progress integration tests are restricted to loopback *_season_progress_test or *_auth_test databases.',
    );
  }
  return value;
}
