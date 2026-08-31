-- Reels can now exist without a listing (AI quick-create), so they carry their own
-- owner and property details instead of inheriting them from a Listing.

-- AlterTable: new optional columns first
ALTER TABLE "Reel" ADD COLUMN     "amenities" TEXT[],
ADD COLUMN     "listingType" TEXT,
ADD COLUMN     "photoUrls" TEXT[],
ADD COLUMN     "price" DOUBLE PRECISION,
ADD COLUMN     "propertyStatus" TEXT,
ADD COLUMN     "title" TEXT,
ALTER COLUMN "listingId" DROP NOT NULL;

-- Add userId nullable, backfill from the owning listing, then enforce NOT NULL.
-- Existing reels all have a listing, so every row gets an owner.
ALTER TABLE "Reel" ADD COLUMN "userId" TEXT;

UPDATE "Reel" r
SET "userId" = l."userId"
FROM "Listing" l
WHERE r."listingId" = l."id";

-- Any reel that somehow has no listing to inherit from cannot be attributed; drop it
-- rather than block the migration (this is a no-op on a consistent database).
DELETE FROM "Reel" WHERE "userId" IS NULL;

ALTER TABLE "Reel" ALTER COLUMN "userId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Reel" ADD CONSTRAINT "Reel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
