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
    "themePreset" TEXT,
    "themeCustom" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarUrl", "createdAt", "dailyNewTarget", "dailyReviewTarget", "defaultCheckMode", "id", "passwordHash", "role", "themeCustom", "themePreset", "username") SELECT "avatarUrl", "createdAt", "dailyNewTarget", "dailyReviewTarget", "defaultCheckMode", "id", "passwordHash", "role", "themeCustom", "themePreset", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
