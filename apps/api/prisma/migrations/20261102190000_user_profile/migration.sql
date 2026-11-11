-- CreateTable
CREATE TABLE "user_profile" (
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "avatarKind" TEXT NOT NULL DEFAULT 'initials',
    "avatarKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "user_profile"
ADD CONSTRAINT "user_profile_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Profile constraints
ALTER TABLE "user_profile"
ADD CONSTRAINT "user_profile_bio_length_check"
CHECK ("bio" IS NULL OR char_length("bio") <= 300);

ALTER TABLE "user_profile"
ADD CONSTRAINT "user_profile_avatar_kind_check"
CHECK ("avatarKind" IN ('initials', 'preset'));

ALTER TABLE "user_profile"
ADD CONSTRAINT "user_profile_avatar_consistency_check"
CHECK (
    ("avatarKind" = 'initials' AND "avatarKey" IS NULL)
    OR
    ("avatarKind" = 'preset' AND "avatarKey" IS NOT NULL)
);