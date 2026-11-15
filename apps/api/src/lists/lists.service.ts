import {
  LIST_MAX_PER_USER,
  type MediaListAccess,
  type MediaListCreateInput,
  type MediaListMode,
  type MediaListUpdateInput,
  type MediaListView,
} from '@garquinsfilm/shared';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';

export class ListLimitReachedError extends Error {
  constructor() {
    super('The list limit has been reached.');
    this.name = 'ListLimitReachedError';
  }
}

export class ListUpdateConflictError extends Error {
  constructor() {
    super('The list changed since it was read.');
    this.name = 'ListUpdateConflictError';
  }
}

export interface ListRepository {
  list(userId: string): Promise<MediaListView[]>;
  create(userId: string, input: MediaListCreateInput): Promise<MediaListView>;
  find(userId: string, listId: string): Promise<MediaListView | null>;
  update(
    userId: string,
    listId: string,
    input: MediaListUpdateInput,
  ): Promise<MediaListView | null>;
  delete(userId: string, listId: string): Promise<boolean>;
}

const listSelect = {
  id: true,
  name: true,
  description: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true } },
  members: { select: { userId: true, role: true } },
  _count: { select: { items: true } },
} as const;

interface SelectedList {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; name: string };
  members: { userId: string; role: string }[];
  _count: { items: number };
}

export class PrismaListRepository implements ListRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string): Promise<MediaListView[]> {
    const rows = await this.prisma.mediaList.findMany({
      where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
      select: listSelect,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => toView(row, userId)).filter(isVisible);
  }

  async create(userId: string, input: MediaListCreateInput): Promise<MediaListView> {
    const created = await this.prisma.$transaction(async (tx) => {
      const owned = await tx.mediaList.count({ where: { ownerId: userId } });
      if (owned >= LIST_MAX_PER_USER) throw new ListLimitReachedError();

      return tx.mediaList.create({
        data: {
          id: randomUUID(),
          ownerId: userId,
          name: input.name,
          description: input.description ?? null,
        },
        select: listSelect,
      });
    });
    return toView(created, userId) as MediaListView;
  }

  async find(userId: string, listId: string): Promise<MediaListView | null> {
    const row = await this.prisma.mediaList.findUnique({
      where: { id: listId },
      select: listSelect,
    });
    if (!row) return null;
    const view = toView(row, userId);
    // Sin acceso se responde como si no existiera: un 403 confirmaría la lista.
    return isVisible(view) ? view : null;
  }

  async update(
    userId: string,
    listId: string,
    input: MediaListUpdateInput,
  ): Promise<MediaListView | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.mediaList.findUnique({
        where: { id: listId },
        select: { ownerId: true, updatedAt: true },
      });
      if (!current || current.ownerId !== userId) return null;
      if (current.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new ListUpdateConflictError();
      }

      const updated = await tx.mediaList.update({
        where: { id: listId },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
        },
        select: listSelect,
      });
      return toView(updated, userId);
    });
  }

  async delete(userId: string, listId: string): Promise<boolean> {
    const result = await this.prisma.mediaList.deleteMany({
      where: { id: listId, ownerId: userId },
    });
    return result.count > 0;
  }
}

export function toView(row: SelectedList, viewerId: string): MediaListView | null {
  const access = resolveAccess(row, viewerId);
  if (!access) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    mode: resolveMode(row.members),
    access,
    owner: row.owner,
    itemCount: row._count.items,
    memberCount: row.members.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function resolveAccess(row: SelectedList, viewerId: string): MediaListAccess | null {
  if (row.ownerId === viewerId) return 'owner';
  const membership = row.members.find((member) => member.userId === viewerId);
  if (!membership) return null;
  return membership.role === 'EDITOR' ? 'editor' : 'reader';
}

function resolveMode(members: { role: string }[]): MediaListMode {
  if (members.length === 0) return 'personal';
  return members.some((member) => member.role === 'EDITOR') ? 'collaborative' : 'shared';
}

function isVisible(view: MediaListView | null): view is MediaListView {
  return view !== null;
}
