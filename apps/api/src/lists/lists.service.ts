import {
  LIST_MAX_ITEMS,
  LIST_MAX_PER_USER,
  type MediaListAccess,
  type MediaListCreateInput,
  type MediaListDetailView,
  type MediaListItemCreateInput,
  type MediaListItemView,
  type MediaListMode,
  type MediaListUpdateInput,
  type MediaListView,
} from '@garquinsfilm/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

export class ListLimitReachedError extends Error {
  constructor() {
    super('The list limit has been reached.');
    this.name = 'ListLimitReachedError';
  }
}

export class ListItemDuplicateError extends Error {
  constructor() {
    super('That title is already in the list.');
    this.name = 'ListItemDuplicateError';
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
  findDetail(userId: string, listId: string): Promise<MediaListDetailView | null>;
  addItem(
    userId: string,
    listId: string,
    input: MediaListItemCreateInput,
  ): Promise<MediaListItemView | null>;
  removeItem(userId: string, listId: string, itemId: string): Promise<boolean>;
  create(userId: string, input: MediaListCreateInput): Promise<MediaListView>;
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

const itemSelect = {
  id: true,
  position: true,
  addedAt: true,
  media: { select: { type: true, tmdbId: true } },
  addedBy: { select: { id: true, name: true } },
} as const;

interface SelectedItem {
  id: string;
  position: number;
  addedAt: Date;
  media: { type: 'movie' | 'tv'; tmdbId: number };
  addedBy: { id: string; name: string } | null;
}

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
          ownerId: userId,
          name: input.name,
          description: input.description ?? null,
        },
        select: listSelect,
      });
    });
    return toView(created, userId) as MediaListView;
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

  async findDetail(userId: string, listId: string): Promise<MediaListDetailView | null> {
    const row = await this.prisma.mediaList.findUnique({
      where: { id: listId },
      select: { ...listSelect, items: { select: itemSelect, orderBy: { position: 'asc' } } },
    });
    if (!row) return null;

    const view = toView(row, userId);
    if (!view) return null;
    return { ...view, items: row.items.map(toItemView) };
  }

  async addItem(
    userId: string,
    listId: string,
    input: MediaListItemCreateInput,
  ): Promise<MediaListItemView | null> {
    return this.prisma.$transaction(async (tx) => {
      // Bloquea la lista para que dos altas simultáneas no repitan posición.
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "media_list" WHERE "id" = ${listId} FOR UPDATE`;
      if (locked.length === 0) return null;

      const list = await tx.mediaList.findUniqueOrThrow({
        where: { id: listId },
        select: { ownerId: true, members: { select: { userId: true, role: true } } },
      });
      if (!canEdit(list, userId)) return null;

      const total = await tx.mediaListItem.count({ where: { listId } });
      if (total >= LIST_MAX_ITEMS) throw new ListLimitReachedError();

      const media = await tx.media.upsert({
        where: {
          source_type_tmdbId: { source: input.source, type: input.type, tmdbId: input.tmdbId },
        },
        create: { source: input.source, type: input.type, tmdbId: input.tmdbId },
        update: {},
        select: { id: true },
      });

      const existing = await tx.mediaListItem.findUnique({
        where: { listId_mediaId: { listId, mediaId: media.id } },
        select: { id: true },
      });
      if (existing) throw new ListItemDuplicateError();

      const last = await tx.mediaListItem.findFirst({
        where: { listId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      const created = await tx.mediaListItem.create({
        data: {
          listId,
          mediaId: media.id,
          addedById: userId,
          position: (last?.position ?? 0) + 1,
        },
        select: itemSelect,
      });
      // Añadir un título cambia la lista, así que su versión avanza.
      await tx.mediaList.update({ where: { id: listId }, data: { updatedAt: new Date() } });
      return toItemView(created);
    });
  }

  async removeItem(userId: string, listId: string, itemId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const list = await tx.mediaList.findUnique({
        where: { id: listId },
        select: { ownerId: true, members: { select: { userId: true, role: true } } },
      });
      if (!list || !canEdit(list, userId)) return false;

      const removed = await tx.mediaListItem.deleteMany({ where: { id: itemId, listId } });
      if (removed.count === 0) return false;

      await tx.mediaList.update({ where: { id: listId }, data: { updatedAt: new Date() } });
      return true;
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

export function toItemView(item: SelectedItem): MediaListItemView {
  return {
    id: item.id,
    position: item.position,
    addedAt: item.addedAt.toISOString(),
    addedBy: item.addedBy,
    type: item.media.type,
    tmdbId: item.media.tmdbId,
    media: null,
  };
}

/** Propietario y editores pueden tocar los títulos; los lectores, no. */
export function canEdit(
  list: { ownerId: string; members: { userId: string; role: string }[] },
  userId: string,
): boolean {
  if (list.ownerId === userId) return true;
  return list.members.some((member) => member.userId === userId && member.role === 'EDITOR');
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
