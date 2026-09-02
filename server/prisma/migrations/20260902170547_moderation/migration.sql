-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderationNote" TEXT,
ADD COLUMN     "moderationReason" TEXT,
ADD COLUMN     "moderationStatus" TEXT NOT NULL DEFAULT 'ok';

-- AlterTable
ALTER TABLE "Reel" ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderationNote" TEXT,
ADD COLUMN     "moderationReason" TEXT,
ADD COLUMN     "moderationStatus" TEXT NOT NULL DEFAULT 'ok';
