/*
  Warnings:

  - You are about to drop the column `artistName` on the `Albums` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name,artistId]` on the table `Albums` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `artistId` to the `Albums` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Albums_name_artistName_key";

-- AlterTable
ALTER TABLE "Albums" DROP COLUMN "artistName",
ADD COLUMN     "artistId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Albums_name_artistId_key" ON "Albums"("name", "artistId");

-- AddForeignKey
ALTER TABLE "Albums" ADD CONSTRAINT "Albums_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
