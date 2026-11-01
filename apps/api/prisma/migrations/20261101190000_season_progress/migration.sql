CREATE TABLE "season_progress" (
    "id" TEXT NOT NULL,
    "libraryEntryId" TEXT NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_progress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "season_progress_seasonNumber_range" CHECK (
        "seasonNumber" BETWEEN 0 AND 9999
    )
);

CREATE UNIQUE INDEX "season_progress_libraryEntryId_seasonNumber_key"
    ON "season_progress"("libraryEntryId", "seasonNumber");

ALTER TABLE "season_progress" ADD CONSTRAINT "season_progress_libraryEntryId_fkey"
    FOREIGN KEY ("libraryEntryId") REFERENCES "library_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
