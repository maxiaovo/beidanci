-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WordProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" DATETIME NOT NULL,
    "lastResult" TEXT NOT NULL DEFAULT '',
    "spellPassed" BOOLEAN NOT NULL DEFAULT false,
    "choicePassed" BOOLEAN NOT NULL DEFAULT false,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WordProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WordProgress_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WordProgress" ("id", "lapses", "lastResult", "nextReviewAt", "reps", "stage", "updatedAt", "userId", "wordId") SELECT "id", "lapses", "lastResult", "nextReviewAt", "reps", "stage", "updatedAt", "userId", "wordId" FROM "WordProgress";
DROP TABLE "WordProgress";
ALTER TABLE "new_WordProgress" RENAME TO "WordProgress";
CREATE UNIQUE INDEX "WordProgress_userId_wordId_key" ON "WordProgress"("userId", "wordId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
