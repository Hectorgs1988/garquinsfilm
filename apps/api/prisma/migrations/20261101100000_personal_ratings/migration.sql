CREATE TABLE "rating" (
    "id" TEXT NOT NULL,
    "libraryEntryId" TEXT NOT NULL,
    "scoreTenths" INTEGER,
    "review" TEXT,
    "containsSpoilers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rating_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rating_scoreTenths_range" CHECK (
        "scoreTenths" IS NULL OR "scoreTenths" BETWEEN 0 AND 100
    ),
    CONSTRAINT "rating_has_score_or_review" CHECK (
        "scoreTenths" IS NOT NULL OR "review" IS NOT NULL
    ),
    CONSTRAINT "rating_review_not_blank" CHECK (
        "review" IS NULL OR length(btrim(
            "review",
            U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
        )) > 0
    ),
    CONSTRAINT "rating_review_length" CHECK (
        "review" IS NULL OR char_length("review") <= 2000
    ),
    CONSTRAINT "rating_spoiler_requires_review" CHECK (
        "review" IS NOT NULL OR "containsSpoilers" = false
    )
);

CREATE UNIQUE INDEX "rating_libraryEntryId_key" ON "rating"("libraryEntryId");

ALTER TABLE "rating" ADD CONSTRAINT "rating_libraryEntryId_fkey"
    FOREIGN KEY ("libraryEntryId") REFERENCES "library_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
