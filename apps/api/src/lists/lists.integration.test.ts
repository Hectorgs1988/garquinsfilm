import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma/client.js';
import { ListUpdateConflictError, PrismaListRepository } from './lists.service.js';

const enabled = process.env.RUN_LISTS_INTEGRATION_TESTS === '1';

describe.skipIf(!enabled)('shared lists PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let repository: PrismaListRepository;
  const ownerId = `lists-test-${randomUUID()}`;
  const readerId = `lists-test-${randomUUID()}`;
  const strangerId = `lists-test-${randomUUID()}`;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getListsTestDatabaseUrl() }),
    });
    repository = new PrismaListRepository(prisma);
    await prisma.$queryRaw`SELECT 1`;
    await prisma.user.createMany({
      data: [ownerId, readerId, strangerId].map((id) => ({
        id,
        name: `Lists test ${id.slice(-6)}`,
        email: `${id}@example.test`,
      })),
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, readerId, strangerId] } } });
    await prisma.$disconnect();
  });

  it('creates a personal list with no members', async () => {
    const created = await repository.create(ownerId, { name: 'Cine de los 90' });

    expect(created).toMatchObject({
      name: 'Cine de los 90',
      description: null,
      mode: 'personal',
      access: 'owner',
      itemCount: 0,
      memberCount: 0,
    });
    expect(created.owner.id).toBe(ownerId);
  });

  it('turns into shared and then collaborative as members arrive', async () => {
    const created = await repository.create(ownerId, { name: 'Compartida' });

    await prisma.mediaListMember.create({
      data: { listId: created.id, userId: readerId, role: 'READER' },
    });
    expect((await repository.find(ownerId, created.id))?.mode).toBe('shared');

    await prisma.mediaListMember.update({
      where: { listId_userId: { listId: created.id, userId: readerId } },
      data: { role: 'EDITOR' },
    });
    expect((await repository.find(ownerId, created.id))?.mode).toBe('collaborative');
  });

  it('reports the access of whoever is asking', async () => {
    const created = await repository.create(ownerId, { name: 'Con lector' });
    await prisma.mediaListMember.create({
      data: { listId: created.id, userId: readerId, role: 'READER' },
    });

    expect((await repository.find(ownerId, created.id))?.access).toBe('owner');
    expect((await repository.find(readerId, created.id))?.access).toBe('reader');
    expect(await repository.find(strangerId, created.id)).toBeNull();
  });

  it('lists what each user can see, and nothing else', async () => {
    const mine = await repository.create(ownerId, { name: 'Solo mía' });
    const withReader = await repository.create(ownerId, { name: 'Con acceso' });
    await prisma.mediaListMember.create({
      data: { listId: withReader.id, userId: readerId, role: 'READER' },
    });

    const readerLists = await repository.list(readerId);
    const readerIds = readerLists.map((item) => item.id);
    expect(readerIds).toContain(withReader.id);
    expect(readerIds).not.toContain(mine.id);
    expect(await repository.list(strangerId)).toEqual([]);
  });

  it('refuses an edit based on a stale version', async () => {
    const created = await repository.create(ownerId, { name: 'Original' });

    const updated = await repository.update(ownerId, created.id, {
      name: 'Renombrada',
      expectedUpdatedAt: created.updatedAt,
    });
    expect(updated?.name).toBe('Renombrada');

    await expect(
      repository.update(ownerId, created.id, {
        name: 'Tarde',
        expectedUpdatedAt: created.updatedAt,
      }),
    ).rejects.toBeInstanceOf(ListUpdateConflictError);
  });

  it('only lets the owner edit or delete', async () => {
    const created = await repository.create(ownerId, { name: 'Ajena' });
    await prisma.mediaListMember.create({
      data: { listId: created.id, userId: readerId, role: 'EDITOR' },
    });

    const updated = await repository.update(readerId, created.id, {
      name: 'Secuestrada',
      expectedUpdatedAt: created.updatedAt,
    });
    expect(updated).toBeNull();
    expect(await repository.delete(readerId, created.id)).toBe(false);
    expect(await repository.delete(ownerId, created.id)).toBe(true);
  });

  it('enforces name and description limits in PostgreSQL', async () => {
    const created = await repository.create(ownerId, { name: 'Con límites' });

    await expect(
      prisma.mediaList.update({ where: { id: created.id }, data: { name: 'x'.repeat(81) } }),
    ).rejects.toThrow();
    await expect(
      prisma.mediaList.update({ where: { id: created.id }, data: { name: '  espacios  ' } }),
    ).rejects.toThrow();
    await expect(
      prisma.mediaList.update({
        where: { id: created.id },
        data: { description: 'x'.repeat(301) },
      }),
    ).rejects.toThrow();
  });

  it('takes the lists away when the owner is deleted', async () => {
    const temporaryId = `lists-test-${randomUUID()}`;
    await prisma.user.create({
      data: { id: temporaryId, name: 'Temporal', email: `${temporaryId}@example.test` },
    });
    const created = await repository.create(temporaryId, { name: 'Efímera' });

    await prisma.user.delete({ where: { id: temporaryId } });
    expect(await prisma.mediaList.count({ where: { id: created.id } })).toBe(0);
  });
});

function getListsTestDatabaseUrl(): string {
  const value = process.env.LISTS_TEST_DATABASE_URL;
  if (!value) {
    throw new Error('LISTS_TEST_DATABASE_URL must point to an isolated local test database.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('LISTS_TEST_DATABASE_URL must be a PostgreSQL URL.');
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  const isTestDatabase = database.endsWith('_lists_test') || database.endsWith('_auth_test');
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
    !isTestDatabase ||
    !['postgres:', 'postgresql:'].includes(url.protocol)
  ) {
    throw new Error(
      'List integration tests are restricted to loopback *_lists_test or *_auth_test databases.',
    );
  }
  return value;
}
