-- CreateTable
CREATE TABLE "Artists" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Albums" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "imageUrl" TEXT,

    CONSTRAINT "Albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tracks" (
    "ISRC" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "length" INTEGER,
    "albumId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tracks_pkey" PRIMARY KEY ("ISRC")
);

-- CreateTable
CREATE TABLE "TrackArtist" (
    "trackISRC" TEXT NOT NULL,
    "artistId" INTEGER NOT NULL,

    CONSTRAINT "TrackArtist_pkey" PRIMARY KEY ("trackISRC","artistId")
);

-- CreateTable
CREATE TABLE "Plays" (
    "id" SERIAL NOT NULL,
    "trackISRC" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "dope" INTEGER NOT NULL DEFAULT 0,
    "nope" INTEGER NOT NULL DEFAULT 0,
    "bookmark" INTEGER NOT NULL DEFAULT 0,
    "boof" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "listeners" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Votes" (
    "id" SERIAL NOT NULL,
    "playId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "dope" INTEGER NOT NULL DEFAULT 0,
    "nope" INTEGER NOT NULL DEFAULT 0,
    "bookmark" INTEGER NOT NULL DEFAULT 0,
    "boof" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Artists_name_key" ON "Artists"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Albums_name_artistName_key" ON "Albums"("name", "artistName");

-- AddForeignKey
ALTER TABLE "Tracks" ADD CONSTRAINT "Tracks_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackArtist" ADD CONSTRAINT "TrackArtist_trackISRC_fkey" FOREIGN KEY ("trackISRC") REFERENCES "Tracks"("ISRC") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackArtist" ADD CONSTRAINT "TrackArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plays" ADD CONSTRAINT "Plays_trackISRC_fkey" FOREIGN KEY ("trackISRC") REFERENCES "Tracks"("ISRC") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Votes" ADD CONSTRAINT "Votes_playId_fkey" FOREIGN KEY ("playId") REFERENCES "Plays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
