-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "notifyMyActivity" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyNewListings" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyNewReels" BOOLEAN NOT NULL DEFAULT true;
