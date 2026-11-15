import type { MediaIdentity, MediaSummary } from './catalog.js';

export const MEDIA_LIST_ROLES = ['READER', 'EDITOR'] as const;
export type MediaListRole = (typeof MEDIA_LIST_ROLES)[number];

/** Se deduce de los miembros; no se almacena. Ver `SHARED_LISTS_DESIGN.md`. */
export const MEDIA_LIST_MODES = ['personal', 'shared', 'collaborative'] as const;
export type MediaListMode = (typeof MEDIA_LIST_MODES)[number];

/** Permiso de quien consulta, resuelto en el servidor en cada petición. */
export const MEDIA_LIST_ACCESS = ['owner', 'editor', 'reader'] as const;
export type MediaListAccess = (typeof MEDIA_LIST_ACCESS)[number];

export const LIST_NAME_MAX_LENGTH = 80;
export const LIST_DESCRIPTION_MAX_LENGTH = 300;
export const LIST_MAX_PER_USER = 50;
export const LIST_MAX_ITEMS = 500;
export const LIST_MAX_MEMBERS = 50;

export interface MediaListView {
  id: string;
  name: string;
  description: string | null;
  mode: MediaListMode;
  access: MediaListAccess;
  owner: { id: string; name: string };
  itemCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MediaListItemView {
  id: string;
  position: number;
  addedAt: string;
  addedBy: { id: string; name: string } | null;
  type: MediaSummary['type'];
  tmdbId: number;
  media: MediaSummary | null;
}

export interface MediaListDetailView extends MediaListView {
  items: MediaListItemView[];
}

export interface MediaListItemCreateInput {
  source: MediaIdentity['source'];
  type: MediaIdentity['type'];
  tmdbId: number;
}

export interface MediaListCreateInput {
  name: string;
  description?: string | null;
}

export interface MediaListUpdateInput {
  name?: string;
  description?: string | null;
  /** `updatedAt` que vio el cliente; si no coincide, la respuesta es 409. */
  expectedUpdatedAt: string;
}
