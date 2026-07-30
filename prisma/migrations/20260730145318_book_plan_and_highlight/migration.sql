-- AlterTable
ALTER TABLE "User" ADD COLUMN "highlightColor" TEXT;

-- CreateTable
CREATE TABLE "BookPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "amountType" TEXT NOT NULL DEFAULT 'words',
    "wordsPerDay" INTEGER NOT NULL DEFAULT 10,
    "fractionDen" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookPlan_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BookPlan_userId_bookId_key" ON "BookPlan"("userId", "bookId");
