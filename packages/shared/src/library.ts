import type { MediaIdentity, MediaSummary, MediaType, Paginated } from './catalog.js';

export const LIBRARY_ENTRY_STATUSES = ['PENDING', 'WATCHING', 'COMPLETED', 'ABANDONED'] as const;

export type LibraryEntryStatus = (typeof LIBRARY_ENTRY_STATUSES)[number];
export type LibrarySortBy = 'addedAt' | 'updatedAt';
export type LibrarySortOrder = 'asc' | 'desc';

export interface LibraryEntryView {
  id: string;
  source: MediaIdentity['source'];
  type: MediaType;
  tmdbId: number;
  status: LibraryEntryStatus;
  isFavorite: boolean;
  addedAt: string;
  updatedAt: string;
  completedAt: string | null;
  media: MediaSummary | null;
}

export interface LibraryCreateInput extends MediaIdentity {
  status?: LibraryEntryStatus;
  isFavorite?: boolean;
}

export interface LibraryUpdateInput {
  status?: LibraryEntryStatus;
  isFavorite?: boolean;
}

export interface LibraryListQuery {
  type?: MediaType;
  status?: LibraryEntryStatus;
  favorite?: boolean;
  page: number;
  pageSize: number;
  sortBy: LibrarySortBy;
  sortOrder: LibrarySortOrder;
}

export type LibraryListResponse = Paginated<LibraryEntryView>;
