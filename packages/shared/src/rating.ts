export interface RatingView {
  libraryEntryId: string;
  score: number | null;
  review: string | null;
  containsSpoilers: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RatingPutInput {
  score: number | null;
  review: string | null;
  containsSpoilers: boolean;
}
