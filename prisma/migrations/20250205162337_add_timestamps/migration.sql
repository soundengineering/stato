-- AlterTable
ALTER TABLE "Albums" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Artists" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TrackArtist" ALTER COLUMN "updatedAt" DROP DEFAULT;
