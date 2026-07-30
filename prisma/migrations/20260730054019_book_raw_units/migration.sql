-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "rawUnits" TEXT NOT NULL DEFAULT '[]',
    "audioDone" INTEGER NOT NULL DEFAULT 0,
    "audioTotal" INTEGER NOT NULL DEFAULT 0,
    "analyzeDone" INTEGER NOT NULL DEFAULT 0,
    "analyzeTotal" INTEGER NOT NULL DEFAULT 0,
    "sharedWithAll" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Book_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Book" ("analyzeDone", "analyzeTotal", "audioDone", "audioTotal", "createdAt", "id", "name", "ownerId", "sharedWithAll", "status") SELECT "analyzeDone", "analyzeTotal", "audioDone", "audioTotal", "createdAt", "id", "name", "ownerId", "sharedWithAll", "status" FROM "Book";
DROP TABLE "Book";
ALTER TABLE "new_Book" RENAME TO "Book";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
