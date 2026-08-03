-- CreateTable
CREATE TABLE "WritingProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "declaredContext" TEXT NOT NULL DEFAULT '{}',
    "goals" TEXT NOT NULL DEFAULT '{}',
    "abilityBand" TEXT NOT NULL DEFAULT '',
    "abilitySummary" TEXT NOT NULL DEFAULT '',
    "dimensions" TEXT NOT NULL DEFAULT '{}',
    "strengths" TEXT NOT NULL DEFAULT '[]',
    "weaknesses" TEXT NOT NULL DEFAULT '[]',
    "evidence" TEXT NOT NULL DEFAULT '[]',
    "assessmentStatus" TEXT NOT NULL DEFAULT 'pending',
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "lastAssessedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WritingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WritingSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "genre" TEXT NOT NULL DEFAULT '',
    "target" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "WritingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WritingMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WritingMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WritingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WritingTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '{}',
    "focus" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "hintLevel" INTEGER NOT NULL DEFAULT 0,
    "failedRounds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "WritingTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WritingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WritingAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "feedback" TEXT NOT NULL DEFAULT '{}',
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "usedHint" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WritingAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WritingTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WritingAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WritingMemoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceAttemptId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "skillCode" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    "exampleBefore" TEXT NOT NULL DEFAULT '',
    "exampleAfter" TEXT NOT NULL DEFAULT '',
    "stage" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WritingMemoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WritingMemoryItem_sourceAttemptId_fkey" FOREIGN KEY ("sourceAttemptId") REFERENCES "WritingAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WritingProfile_userId_key" ON "WritingProfile"("userId");
CREATE INDEX "WritingSession_userId_status_updatedAt_idx" ON "WritingSession"("userId", "status", "updatedAt");
CREATE INDEX "WritingMessage_sessionId_createdAt_idx" ON "WritingMessage"("sessionId", "createdAt");
CREATE UNIQUE INDEX "WritingTask_sessionId_orderIndex_key" ON "WritingTask"("sessionId", "orderIndex");
CREATE UNIQUE INDEX "WritingAttempt_clientRequestId_key" ON "WritingAttempt"("clientRequestId");
CREATE UNIQUE INDEX "WritingAttempt_taskId_version_key" ON "WritingAttempt"("taskId", "version");
CREATE INDEX "WritingAttempt_userId_createdAt_idx" ON "WritingAttempt"("userId", "createdAt");
CREATE INDEX "WritingMemoryItem_userId_status_nextReviewAt_idx" ON "WritingMemoryItem"("userId", "status", "nextReviewAt");
