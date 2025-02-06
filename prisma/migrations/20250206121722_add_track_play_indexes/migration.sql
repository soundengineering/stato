-- CreateIndex
CREATE INDEX "Plays_trackISRC_playedAt_idx" ON "Plays"("trackISRC", "playedAt");

-- CreateIndex
CREATE INDEX "Plays_score_idx" ON "Plays"("score");
