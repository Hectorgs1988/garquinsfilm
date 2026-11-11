export const PROFILE_NAME_MAX_LENGTH = 50;
export const PROFILE_BIO_MAX_LENGTH = 300;

// Solo iniciales hasta cerrar ADR-006 (identidad visual). La columna `avatarKind`
// admite `preset`, pero la API no lo expone todavía.
export const PROFILE_AVATAR_KINDS = ['initials'] as const;
export type ProfileAvatarKind = (typeof PROFILE_AVATAR_KINDS)[number];

export interface ProfileAvatar {
  kind: ProfileAvatarKind;
}

export interface ProfileView {
  name: string;
  bio: string | null;
  avatar: ProfileAvatar;
}

export interface ProfileUpdateInput {
  name?: string;
  bio?: string | null;
}
