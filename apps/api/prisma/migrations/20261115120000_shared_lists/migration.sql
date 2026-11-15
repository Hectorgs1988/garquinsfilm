CREATE TYPE "MediaListRole" AS ENUM ('READER', 'EDITOR');

CREATE TABLE "media_list" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_list_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_list_name_length" CHECK (
        char_length("name") BETWEEN 1 AND 80 AND btrim("name") = "name" AND btrim("name") <> ''
    ),
    CONSTRAINT "media_list_description_length" CHECK (
        "description" IS NULL OR (char_length("description") BETWEEN 1 AND 300)
    )
);

CREATE TABLE "media_list_member" (
    "listId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MediaListRole" NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_list_member_pkey" PRIMARY KEY ("listId", "userId")
);

CREATE TABLE "media_list_item" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "addedById" TEXT,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_list_item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_list_item_position_positive" CHECK ("position" > 0)
);

CREATE INDEX "media_list_ownerId_updatedAt_idx" ON "media_list"("ownerId", "updatedAt");
CREATE INDEX "media_list_member_userId_idx" ON "media_list_member"("userId");
CREATE UNIQUE INDEX "media_list_item_listId_mediaId_key" ON "media_list_item"("listId", "mediaId");

-- Reordenar desplaza varias filas a la vez: sin aplazar la comprobación, un paso
-- intermedio del UPDATE rompería la unicidad aunque el resultado final sea correcto.
ALTER TABLE "media_list_item" ADD CONSTRAINT "media_list_item_listId_position_key"
    UNIQUE ("listId", "position") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "media_list" ADD CONSTRAINT "media_list_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "media_list_member" ADD CONSTRAINT "media_list_member_listId_fkey"
    FOREIGN KEY ("listId") REFERENCES "media_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_list_member" ADD CONSTRAINT "media_list_member_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "media_list_item" ADD CONSTRAINT "media_list_item_listId_fkey"
    FOREIGN KEY ("listId") REFERENCES "media_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_list_item" ADD CONSTRAINT "media_list_item_mediaId_fkey"
    FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_list_item" ADD CONSTRAINT "media_list_item_addedById_fkey"
    FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
