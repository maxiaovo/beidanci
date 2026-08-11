-- CreateIndex
CREATE INDEX "StudyLog_userId_createdAt_idx" ON "StudyLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WordProgress_userId_nextReviewAt_idx" ON "WordProgress"("userId", "nextReviewAt");
