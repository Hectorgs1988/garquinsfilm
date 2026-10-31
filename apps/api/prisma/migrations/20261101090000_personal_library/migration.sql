CREATE TYPE "MediaSource" AS ENUM ('tmdb');
CREATE TYPE "MediaType" AS ENUM ('movie', 'tv');
CREATE TYPE "LibraryEntryStatus" AS ENUM ('PENDING', 'WATCHING', 'COMPLETED', 'ABANDONED');

CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "source" "MediaSource" NOT NULL,
    "type" "MediaType" NOT NULL,
    "tmdbId" INTEGER NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_tmdbId_positive" CHECK ("tmdbId" > 0)
);

CREATE TABLE "library_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "status" "LibraryEntryStatus" NOT NULL DEFAULT 'PENDING',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "library_entry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "library_entry_completedAt_consistent" CHECK (
        ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL) OR
        ("status" <> 'COMPLETED' AND "completedAt" IS NULL)
    )
);

CREATE UNIQUE INDEX "media_source_type_tmdbId_key" ON "media"("source", "type", "tmdbId");
CREATE UNIQUE INDEX "library_entry_userId_mediaId_key" ON "library_entry"("userId", "mediaId");
CREATE INDEX "library_entry_userId_addedAt_idx" ON "library_entry"("userId", "addedAt");
CREATE INDEX "library_entry_userId_updatedAt_idx" ON "library_entry"("userId", "updatedAt");
CREATE INDEX "library_entry_userId_status_idx" ON "library_entry"("userId", "status");
CREATE INDEX "library_entry_userId_isFavorite_idx" ON "library_entry"("userId", "isFavorite");

ALTER TABLE "library_entry" ADD CONSTRAINT "library_entry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "library_entry" ADD CONSTRAINT "library_entry_mediaId_fkey"
    FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
