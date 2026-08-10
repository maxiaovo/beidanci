-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReviewSkip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL DEFAULT 'words',
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewSkip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ReviewSkip" ("count", "createdAt", "id", "userId") SELECT "count", "createdAt", "id", "userId" FROM "ReviewSkip";
DROP TABLE "ReviewSkip";
ALTER TABLE "new_ReviewSkip" RENAME TO "ReviewSkip";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
