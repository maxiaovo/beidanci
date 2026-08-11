-- AlterTable
ALTER TABLE "Book" ADD COLUMN "coverFile" TEXT;

-- CreateTable
CREATE TABLE "BookEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookEnrollment_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BookEnrollment_userId_bookId_key" ON "BookEnrollment"("userId", "bookId");

-- 老用户行为无缝：自己导入的、被管理员分配的、已配置每日计划的书，自动加入"在学"
INSERT INTO "BookEnrollment" ("id", "userId", "bookId", "createdAt")
SELECT lower(hex(randomblob(12))), src."userId", src."bookId", datetime('now')
FROM (
    SELECT "ownerId" AS "userId", "id" AS "bookId" FROM "Book"
    UNION
    SELECT "userId", "bookId" FROM "BookAssignment"
    UNION
    SELECT "userId", "bookId" FROM "BookPlan"
) AS src
GROUP BY src."userId", src."bookId";
