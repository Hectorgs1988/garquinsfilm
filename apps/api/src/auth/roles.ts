export const USER_ROLES = {
  admin: 'admin',
  user: 'user',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export function isUserRole(value: string): value is UserRole {
  return value === USER_ROLES.admin || value === USER_ROLES.user;
}

export function hasAdminRole(value: string | null | undefined): boolean {
  return value === USER_ROLES.admin;
}
