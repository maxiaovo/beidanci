-- AlterTable
ALTER TABLE "StudyLog" ADD COLUMN "attempt" TEXT;

-- CreateTable
CREATE TABLE "StudyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "rangeStart" DATETIME NOT NULL,
    "rangeEnd" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "step" TEXT NOT NULL DEFAULT 'collect',
    "error" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "spoken" TEXT NOT NULL DEFAULT '',
    "audioFile" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "avatarUrl" TEXT,
    "parentId" TEXT,
    "dailyNewTarget" INTEGER NOT NULL DEFAULT 20,
    "dailyReviewTarget" INTEGER NOT NULL DEFAULT 100,
    "defaultCheckMode" TEXT NOT NULL DEFAULT 'spell',
    "recoveryCorrectTarget" INTEGER NOT NULL DEFAULT 1,
    "cyclicRecovery" BOOLEAN NOT NULL DEFAULT false,
    "themePreset" TEXT,
    "themeCustom" TEXT,
    "highlightColor" TEXT,
    "wordSize" TEXT NOT NULL DEFAULT 'big',
    "segmentSize" TEXT NOT NULL DEFAULT 'big',
    "sentenceSize" TEXT NOT NULL DEFAULT 'big',
    "sentenceCnSize" TEXT NOT NULL DEFAULT 'big',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarUrl", "createdAt", "dailyNewTarget", "dailyReviewTarget", "defaultCheckMode", "highlightColor", "id", "parentId", "passwordHash", "role", "segmentSize", "sentenceCnSize", "sentenceSize", "themeCustom", "themePreset", "username", "wordSize") SELECT "avatarUrl", "createdAt", "dailyNewTarget", "dailyReviewTarget", "defaultCheckMode", "highlightColor", "id", "parentId", "passwordHash", "role", "segmentSize", "sentenceCnSize", "sentenceSize", "themeCustom", "themePreset", "username", "wordSize" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "StudyReport_userId_createdAt_idx" ON "StudyReport"("userId", "createdAt");
