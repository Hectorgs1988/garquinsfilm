import type { ProfileUpdateInput, ProfileView } from '@garquinsfilm/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

export interface ProfileRepository {
  find(userId: string): Promise<ProfileView | null>;
  update(userId: string, input: ProfileUpdateInput): Promise<ProfileView | null>;
}

const profileSelect = {
  name: true,
  profile: { select: { bio: true } },
} as const;

interface SelectedProfile {
  name: string;
  profile: { bio: string | null } | null;
}

export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(userId: string): Promise<ProfileView | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });
    return user ? toView(user) : null;
  }

  async update(userId: string, input: ProfileUpdateInput): Promise<ProfileView | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!exists) return null;

        if (input.name !== undefined) {
          await tx.user.update({ where: { id: userId }, data: { name: input.name } });
        }
        if (input.bio !== undefined) {
          await tx.userProfile.upsert({
            where: { userId },
            create: { userId, bio: input.bio },
            update: { bio: input.bio },
          });
        }

        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: profileSelect,
        });
        return toView(user);
      });
    } catch (error) {
      // El usuario se eliminó durante la operación.
      if (isRecordNotFound(error)) return null;
      throw error;
    }
  }
}

function toView(user: SelectedProfile): ProfileView {
  return {
    name: user.name,
    bio: user.profile?.bio ?? null,
    avatar: { kind: 'initials' },
  };
}

function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025';
}
