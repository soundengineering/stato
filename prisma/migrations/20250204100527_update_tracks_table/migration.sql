/*
  Warnings:

  - You are about to drop the column `boof` on the `Plays` table. All the data in the column will be lost.
  - You are about to drop the column `bookmark` on the `Plays` table. All the data in the column will be lost.
  - You are about to drop the column `dope` on the `Plays` table. All the data in the column will be lost.
  - You are about to drop the column `nope` on the `Plays` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `Plays` table. All the data in the column will be lost.
  - You are about to drop the column `boof` on the `Votes` table. All the data in the column will be lost.
  - You are about to drop the column `bookmark` on the `Votes` table. All the data in the column will be lost.
  - You are about to drop the column `dope` on the `Votes` table. All the data in the column will be lost.
  - You are about to drop the column `nope` on the `Votes` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[trackISRC,userId,channelId,playedAt]` on the table `Plays` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `playedAt` to the `Plays` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Plays" DROP COLUMN "boof",
DROP COLUMN "bookmark",
DROP COLUMN "dope",
DROP COLUMN "nope",
DROP COLUMN "score",
ADD COLUMN     "playedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Votes" DROP COLUMN "boof",
DROP COLUMN "bookmark",
DROP COLUMN "dope",
DROP COLUMN "nope",
ADD COLUMN     "boofs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bookmarks" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "nopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Plays_trackISRC_userId_channelId_playedAt_key" ON "Plays"("trackISRC", "userId", "channelId", "playedAt");
