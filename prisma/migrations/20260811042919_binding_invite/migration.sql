-- CreateTable
CREATE TABLE "BindingInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "BindingInvite_parentId_childId_createdBy_key" ON "BindingInvite"("parentId", "childId", "createdBy");
