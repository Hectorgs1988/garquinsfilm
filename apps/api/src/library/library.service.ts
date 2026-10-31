import {
  type LibraryCreateInput,
  type LibraryEntryStatus,
  type LibraryEntryView,
  type LibraryListQuery,
  type LibraryListResponse,
  type LibraryUpdateInput,
} from '@garquinsfilm/shared';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';

export class LibraryDuplicateEntryError extends Error {
  constructor(options?: ErrorOptions) {
    super('The media is already in this library.', options);
    this.name = 'LibraryDuplicateEntryError';
  }
}

export class LibraryUpdateConflictError extends Error {
  constructor(options?: ErrorOptions) {
    super('The library entry changed concurrently.', options);
    this.name = 'LibraryUpdateConflictError';
  }
}

export interface LibraryRepository {
  create(userId: string, input: LibraryCreateInput): Promise<LibraryEntryView>;
  list(userId: string, query: LibraryListQuery): Promise<LibraryListResponse>;
  find(userId: string, id: string): Promise<LibraryEntryView | null>;
  update(userId: string, id: string, input: LibraryUpdateInput): Promise<LibraryEntryView | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

const mediaSelect = {
  id: true,
  source: true,
  type: true,
  tmdbId: true,
} as const;

const entrySelect = {
  id: true,
  status: true,
  isFavorite: true,
  addedAt: true,
  updatedAt: true,
  completedAt: true,
  media: { select: mediaSelect },
} as const;

type SelectedEntry = Prisma.LibraryEntryGetPayload<{ select: typeof entrySelect }>;

export class PrismaLibraryRepository implements LibraryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string, input: LibraryCreateInput): Promise<LibraryEntryView> {
    const status = input.status ?? 'PENDING';
    try {
      const entry = await this.prisma.$transaction(async (tx) => {
        const media = await tx.media.upsert({
          where: {
            source_type_tmdbId: {
              source: input.source,
              type: input.type,
              tmdbId: input.tmdbId,
            },
          },
          create: {
            source: input.source,
            type: input.type,
            tmdbId: input.tmdbId,
          },
          update: {},
          select: { id: true },
        });

        return tx.libraryEntry.create({
          data: {
            userId,
            mediaId: media.id,
            status,
            isFavorite: input.isFavorite ?? false,
            completedAt: status === 'COMPLETED' ? new Date() : null,
          },
          select: entrySelect,
        });
      });
      return toView(entry);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new LibraryDuplicateEntryError({ cause: error });
      }
      throw error;
    }
  }

  async list(userId: string, query: LibraryListQuery): Promise<LibraryListResponse> {
    const where: Prisma.LibraryEntryWhereInput = {
      userId,
      ...(query.type === undefined ? {} : { media: { type: query.type } }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.favorite === undefined ? {} : { isFavorite: query.favorite }),
    };
    const [entries, totalResults] = await this.prisma.$transaction(
      [
        this.prisma.libraryEntry.findMany({
          where,
          orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: entrySelect,
        }),
        this.prisma.libraryEntry.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );

    return {
      page: query.page,
      totalPages: Math.ceil(totalResults / query.pageSize),
      totalResults,
      results: entries.map(toView),
    };
  }

  async find(userId: string, id: string): Promise<LibraryEntryView | null> {
    const entry = await this.prisma.libraryEntry.findFirst({
      where: { id, userId },
      select: entrySelect,
    });
    return entry ? toView(entry) : null;
  }

  async update(
    userId: string,
    id: string,
    input: LibraryUpdateInput,
  ): Promise<LibraryEntryView | null> {
    try {
      const entry = await this.prisma.$transaction(
        async (tx) => {
          const current = await tx.libraryEntry.findFirst({
            where: { id, userId },
            select: { status: true, completedAt: true },
          });
          if (!current) {
            return null;
          }

          const status = input.status ?? current.status;
          const completedAt = resolveCompletedAt(current.status, current.completedAt, status);

          const updateResult = await tx.libraryEntry.updateMany({
            where: { id, userId },
            data: {
              ...(input.status === undefined ? {} : { status }),
              ...(input.isFavorite === undefined ? {} : { isFavorite: input.isFavorite }),
              completedAt,
            },
          });
          if (updateResult.count !== 1) {
            return null;
          }
          return tx.libraryEntry.findFirst({
            where: { id, userId },
            select: entrySelect,
          });
        },
        { isolationLevel: 'Serializable' },
      );
      return entry ? toView(entry) : null;
    } catch (error) {
      if (isSerializationConflict(error)) {
        throw new LibraryUpdateConflictError({ cause: error });
      }
      throw error;
    }
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.libraryEntry.deleteMany({ where: { id, userId } });
    return result.count === 1;
  }
}

export function createLibraryService(repository: LibraryRepository) {
  return {
    create(userId: string, input: LibraryCreateInput) {
      return repository.create(userId, input);
    },
    list(userId: string, query: LibraryListQuery) {
      return repository.list(userId, query);
    },
    find(userId: string, id: string) {
      return repository.find(userId, id);
    },
    update(userId: string, id: string, input: LibraryUpdateInput) {
      return repository.update(userId, id, input);
    },
    delete(userId: string, id: string) {
      return repository.delete(userId, id);
    },
  };
}

export function resolveCompletedAt(
  currentStatus: LibraryEntryStatus,
  currentCompletedAt: Date | null,
  nextStatus: LibraryEntryStatus,
  now = new Date(),
): Date | null {
  if (nextStatus !== 'COMPLETED') {
    return null;
  }
  return currentStatus === 'COMPLETED' ? currentCompletedAt : now;
}

function toView(entry: SelectedEntry): LibraryEntryView {
  return {
    id: entry.id,
    source: entry.media.source,
    type: entry.media.type,
    tmdbId: entry.media.tmdbId,
    status: entry.status,
    isFavorite: entry.isFavorite,
    addedAt: entry.addedAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    completedAt: entry.completedAt?.toISOString() ?? null,
    media: null,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}
