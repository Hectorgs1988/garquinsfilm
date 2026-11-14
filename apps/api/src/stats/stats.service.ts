import type {
  LibraryEntryStatus,
  MediaType,
  ProfileStatsCounts,
  ProfileStatsView,
} from '@garquinsfilm/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

export interface StatsRepository {
  summary(userId: string): Promise<ProfileStatsView>;
}

export class PrismaStatsRepository implements StatsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async summary(userId: string): Promise<ProfileStatsView> {
    const [movies, series, ratings] = await Promise.all([
      this.countByStatus(userId, 'movie'),
      this.countByStatus(userId, 'tv'),
      this.prisma.rating.aggregate({
        // Una reseña sin nota no entra en la media.
        where: { libraryEntry: { userId }, scoreTenths: { not: null } },
        _avg: { scoreTenths: true },
        _count: { scoreTenths: true },
      }),
    ]);

    return {
      movies,
      series,
      ratings: {
        average: toScore(ratings._avg.scoreTenths),
        count: ratings._count.scoreTenths,
      },
    };
  }

  private async countByStatus(userId: string, type: MediaType): Promise<ProfileStatsCounts> {
    const rows = await this.prisma.libraryEntry.groupBy({
      by: ['status'],
      where: { userId, media: { type } },
      _count: { _all: true },
    });
    const countFor = (status: LibraryEntryStatus): number =>
      rows.find((row) => row.status === status)?._count._all ?? 0;

    return { completed: countFor('COMPLETED'), pending: countFor('PENDING') };
  }
}

/**
 * Las notas se guardan en décimas enteras. Se promedian en esa escala y se
 * redondea a una décima para no arrastrar error de coma flotante.
 */
export function toScore(averageTenths: number | null): number | null {
  if (averageTenths === null || !Number.isFinite(averageTenths)) return null;
  return Math.round(averageTenths) / 10;
}
