-- CreateTable
CREATE TABLE "WordAudio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wordId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "voice" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WordAudio_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WordAudio_wordId_kind_idx" ON "WordAudio"("wordId", "kind");

-- Backfill：现有音频登记为首个版本（当前启用项仍由 Word.audio* 指向）
INSERT INTO "WordAudio" ("id", "wordId", "kind", "file")
SELECT lower(hex(randomblob(16))), "id", 'word', "audioWord" FROM "Word" WHERE "audioWord" IS NOT NULL AND "audioWord" != '';
INSERT INTO "WordAudio" ("id", "wordId", "kind", "file")
SELECT lower(hex(randomblob(16))), "id", 'ex1', "audioEx1" FROM "Word" WHERE "audioEx1" IS NOT NULL AND "audioEx1" != '';
INSERT INTO "WordAudio" ("id", "wordId", "kind", "file")
SELECT lower(hex(randomblob(16))), "id", 'ex2', "audioEx2" FROM "Word" WHERE "audioEx2" IS NOT NULL AND "audioEx2" != '';
