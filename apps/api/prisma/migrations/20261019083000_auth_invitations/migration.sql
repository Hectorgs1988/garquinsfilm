-- CreateTable
CREATE TYPE "GlobalRole" AS ENUM ('admin', 'user');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING_DELIVERY', 'ACTIVE', 'DELIVERY_FAILED', 'REVOKED', 'CONSUMED');

ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "user" ALTER COLUMN "role" TYPE "GlobalRole" USING ("role"::"GlobalRole");
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user';

CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING_DELIVERY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "consumedUserId" TEXT,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tokenHash_key" ON "invitation"("tokenHash");
CREATE UNIQUE INDEX "invitation_consumedUserId_key" ON "invitation"("consumedUserId");
CREATE INDEX "invitation_email_expiresAt_idx" ON "invitation"("email", "expiresAt");
CREATE INDEX "invitation_createdByUserId_createdAt_idx" ON "invitation"("createdByUserId", "createdAt");
CREATE INDEX "audit_event_actorUserId_createdAt_idx" ON "audit_event"("actorUserId", "createdAt");
CREATE INDEX "audit_event_action_createdAt_idx" ON "audit_event"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_consumedUserId_fkey" FOREIGN KEY ("consumedUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
