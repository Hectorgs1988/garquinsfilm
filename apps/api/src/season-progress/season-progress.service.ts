import {
  SEASON_PROGRESS_MAX_PER_ENTRY,
  type SeasonProgressItem,
  type SeasonProgressView,
} from '@garquinsfilm/shared';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { ValidatedSeasonBatch } from './season-progress.validation.js';

export type SeasonProgressOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'not_found' }
  | { kind: 'not_series' }
  | { kind: 'limit_reached' };

export interface SeasonCompleteResult {
  season: SeasonProgressItem;
  created: boolean;
}

export interface SeasonProgressRepository {
  list(userId: string, entryId: string): Promise<SeasonProgressOutcome<SeasonProgressView>>;
  complete(
    userId: string,
    entryId: string,
    seasonNumber: number,
  ): Promise<SeasonProgressOutcome<SeasonCompleteResult>>;
  uncomplete(
    userId: string,
    entryId: string,
    seasonNumber: number,
  ): Promise<SeasonProgressOutcome<null>>;
  applyBatch(
    userId: string,
    entryId: string,
    batch: ValidatedSeasonBatch,
  ): Promise<SeasonProgressOutcome<SeasonProgressView>>;
}

const seasonSelect = { seasonNumber: true, completedAt: true } as const;

type SelectedSeason = Prisma.SeasonProgressGetPayload<{ select: typeof seasonSelect }>;
type Tx = Prisma.TransactionClient;

/*
 * Every mutation runs in a READ COMMITTED transaction that first takes
 * `FOR UPDATE` on the owning library_entry row. That single lock:
 *  - serialises all writers of one entry, so the 500-season cap is checked and
 *    applied atomically (a count-then-insert race is impossible);
 *  - blocks a concurrent entry deletion until the transaction ends, and returns
 *    no row if the entry is already gone, so no FK violation can surface;
 *  - makes opposite PUT/DELETE operations take effect in a valid sequential order.
 * It does not write to library_entry, so status, favourites, completedAt and
 * updatedAt are untouched. Different entries never contend with each other.
 */
export class PrismaSeasonProgressRepository implements SeasonProgressRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string, entryId: string): Promise<SeasonProgressOutcome<SeasonProgressView>> {
    const entry = await this.prisma.libraryEntry.findFirst({
      where: { id: entryId, userId },
      select: {
        media: { select: { type: true } },
        seasonProgress: { select: seasonSelect, orderBy: { seasonNumber: 'asc' } },
      },
    });
    if (!entry) return { kind: 'not_found' };
    if (entry.media.type !== 'tv') return { kind: 'not_series' };
    return { kind: 'ok', value: toView(entryId, entry.seasonProgress) };
  }

  async complete(
    userId: string,
    entryId: string,
    seasonNumber: number,
  ): Promise<SeasonProgressOutcome<SeasonCompleteResult>> {
    return this.mutate<SeasonCompleteResult>(userId, entryId, async (tx) => {
      const existing = await tx.seasonProgress.findUnique({
        where: { libraryEntryId_seasonNumber: { libraryEntryId: entryId, seasonNumber } },
        select: seasonSelect,
      });
      if (existing) {
        return { kind: 'ok', value: { season: toItem(existing), created: false } };
      }
      const count = await tx.seasonProgress.count({ where: { libraryEntryId: entryId } });
      if (count >= SEASON_PROGRESS_MAX_PER_ENTRY) return { kind: 'limit_reached' };
      const created = await tx.seasonProgress.create({
        data: { libraryEntryId: entryId, seasonNumber },
        select: seasonSelect,
      });
      return { kind: 'ok', value: { season: toItem(created), created: true } };
    });
  }

  async uncomplete(
    userId: string,
    entryId: string,
    seasonNumber: number,
  ): Promise<SeasonProgressOutcome<null>> {
    return this.mutate<null>(userId, entryId, async (tx) => {
      await tx.seasonProgress.deleteMany({ where: { libraryEntryId: entryId, seasonNumber } });
      return { kind: 'ok', value: null };
    });
  }

  async applyBatch(
    userId: string,
    entryId: string,
    batch: ValidatedSeasonBatch,
  ): Promise<SeasonProgressOutcome<SeasonProgressView>> {
    return this.mutate<SeasonProgressView>(userId, entryId, async (tx) => {
      const current = await tx.seasonProgress.findMany({
        where: { libraryEntryId: entryId },
        select: { seasonNumber: true },
      });
      const existing = new Set(current.map((season) => season.seasonNumber));
      const toRemove = batch.uncomplete.filter((seasonNumber) => existing.has(seasonNumber));
      const toAdd = batch.complete.filter((seasonNumber) => !existing.has(seasonNumber));
      if (existing.size - toRemove.length + toAdd.length > SEASON_PROGRESS_MAX_PER_ENTRY) {
        return { kind: 'limit_reached' };
      }

      if (toRemove.length > 0) {
        await tx.seasonProgress.deleteMany({
          where: { libraryEntryId: entryId, seasonNumber: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.seasonProgress.createMany({
          data: toAdd.map((seasonNumber) => ({ libraryEntryId: entryId, seasonNumber })),
          skipDuplicates: true,
        });
      }
      const seasons = await tx.seasonProgress.findMany({
        where: { libraryEntryId: entryId },
        select: seasonSelect,
        orderBy: { seasonNumber: 'asc' },
      });
      return { kind: 'ok', value: toView(entryId, seasons) };
    });
  }

  private async mutate<T>(
    userId: string,
    entryId: string,
    operation: (tx: Tx) => Promise<SeasonProgressOutcome<T>>,
  ): Promise<SeasonProgressOutcome<T>> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<{ type: string }[]>`
            SELECT m."type"::text AS "type"
            FROM "library_entry" e
            JOIN "media" m ON m."id" = e."mediaId"
            WHERE e."id" = ${entryId} AND e."userId" = ${userId}
            FOR UPDATE OF e`;
          if (rows.length === 0) return { kind: 'not_found' };
          if (rows[0].type !== 'tv') return { kind: 'not_series' };
          return operation(tx);
        },
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      // Defensive: the row lock prevents this, but a vanished entry must never become a 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return { kind: 'not_found' };
      }
      throw error;
    }
  }
}

function toItem(season: SelectedSeason): SeasonProgressItem {
  return { seasonNumber: season.seasonNumber, completedAt: season.completedAt.toISOString() };
}

function toView(entryId: string, seasons: SelectedSeason[]): SeasonProgressView {
  return { libraryEntryId: entryId, completedSeasons: seasons.map(toItem) };
}
