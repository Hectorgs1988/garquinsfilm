import type { RatingPutInput, RatingView } from '@garquinsfilm/shared';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { scoreToTenths } from './ratings.validation.js';

export class RatingConflictError extends Error {
  constructor(options?: ErrorOptions) {
    super('The rating changed concurrently.', options);
    this.name = 'RatingConflictError';
  }
}

export interface RatingLookup {
  entryExists: boolean;
  rating: RatingView | null;
}

export interface RatingSetResult {
  rating: RatingView;
  created: boolean;
}

export interface RatingRepository {
  find(userId: string, entryId: string): Promise<RatingLookup>;
  set(userId: string, entryId: string, input: RatingPutInput): Promise<RatingSetResult | null>;
  delete(userId: string, entryId: string): Promise<boolean>;
}

const ratingSelect = {
  libraryEntryId: true,
  scoreTenths: true,
  review: true,
  containsSpoilers: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SelectedRating = Prisma.RatingGetPayload<{ select: typeof ratingSelect }>;

export class PrismaRatingRepository implements RatingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(userId: string, entryId: string): Promise<RatingLookup> {
    const entry = await this.prisma.libraryEntry.findFirst({
      where: { id: entryId, userId },
      select: { rating: { select: ratingSelect } },
    });
    return entry
      ? { entryExists: true, rating: entry.rating ? toView(entry.rating) : null }
      : { entryExists: false, rating: null };
  }

  async set(
    userId: string,
    entryId: string,
    input: RatingPutInput,
  ): Promise<RatingSetResult | null> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const entry = await tx.libraryEntry.findFirst({
            where: { id: entryId, userId },
            select: { id: true },
          });
          if (!entry) return null;

          const existing = await tx.rating.findUnique({
            where: { libraryEntryId: entryId },
            select: { id: true },
          });
          const data = {
            scoreTenths: scoreToTenths(input.score),
            review: input.review,
            containsSpoilers: input.containsSpoilers,
          };
          const rating = existing
            ? await tx.rating.update({
                where: { libraryEntryId: entryId },
                data,
                select: ratingSelect,
              })
            : await tx.rating.create({
                data: { libraryEntryId: entryId, ...data },
                select: ratingSelect,
              });
          return { rating: toView(rating), created: !existing };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (isRatingWriteConflict(error)) {
        throw new RatingConflictError({ cause: error });
      }
      throw error;
    }
  }

  async delete(userId: string, entryId: string): Promise<boolean> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const entry = await tx.libraryEntry.findFirst({
            where: { id: entryId, userId },
            select: { id: true },
          });
          if (!entry) return false;
          await tx.rating.deleteMany({ where: { libraryEntryId: entryId } });
          return true;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (isRatingWriteConflict(error)) {
        throw new RatingConflictError({ cause: error });
      }
      throw error;
    }
  }
}

function toView(rating: SelectedRating): RatingView {
  return {
    libraryEntryId: rating.libraryEntryId,
    score: rating.scoreTenths === null ? null : rating.scoreTenths / 10,
    review: rating.review,
    containsSpoilers: rating.containsSpoilers,
    createdAt: rating.createdAt.toISOString(),
    updatedAt: rating.updatedAt.toISOString(),
  };
}

function isRatingWriteConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || error.code === 'P2002')
  );
}
