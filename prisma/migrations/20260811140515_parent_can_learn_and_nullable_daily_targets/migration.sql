-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "parentCanLearn" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "parentId" TEXT,
    "dailyNewTarget" INTEGER,
    "dailyReviewTarget" INTEGER,
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
INSERT INTO "new_User" ("avatarUrl", "createdAt", "cyclicRecovery", "dailyNewTarget", "dailyReviewTarget", "defaultCheckMode", "highlightColor", "id", "parentId", "passwordHash", "recoveryCorrectTarget", "role", "segmentSize", "sentenceCnSize", "sentenceSize", "themeCustom", "themePreset", "username", "wordSize") SELECT "avatarUrl", "createdAt", "cyclicRecovery", "dailyNewTarget", "dailyReviewTarget", "defaultCheckMode", "highlightColor", "id", "parentId", "passwordHash", "recoveryCorrectTarget", "role", "segmentSize", "sentenceCnSize", "sentenceSize", "themeCustom", "themePreset", "username", "wordSize" FROM "User";
-- 等于旧默认值（20/100）的视为未覆写，置 NULL 跟随全局默认
UPDATE "new_User" SET "dailyNewTarget" = NULL WHERE "dailyNewTarget" = 20;
UPDATE "new_User" SET "dailyReviewTarget" = NULL WHERE "dailyReviewTarget" = 100;
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
