/*
  Warnings:

  - You are about to drop the `Votes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Votes" DROP CONSTRAINT "Votes_playId_fkey";

-- AlterTable
ALTER TABLE "Plays" ADD COLUMN     "boofs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bookmarks" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "nopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "Votes";
