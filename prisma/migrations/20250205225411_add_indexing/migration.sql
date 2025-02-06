-- CreateIndex
CREATE INDEX "Albums_name_idx" ON "Albums"("name");

-- CreateIndex
CREATE INDEX "Artists_name_idx" ON "Artists"("name");

-- CreateIndex
CREATE INDEX "Plays_playedAt_idx" ON "Plays"("playedAt");

-- CreateIndex
CREATE INDEX "Plays_userId_idx" ON "Plays"("userId");

-- CreateIndex
CREATE INDEX "Plays_channelId_idx" ON "Plays"("channelId");

-- CreateIndex
CREATE INDEX "Tracks_title_idx" ON "Tracks"("title");
