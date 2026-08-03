-- CreateTable
CREATE TABLE "DailyWordResource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "daySlot" INTEGER NOT NULL,
    "word" TEXT NOT NULL,
    "phonetic" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'nature',
    "imageAlt" TEXT NOT NULL DEFAULT '',
    "imageFile" TEXT NOT NULL,
    "audioFile" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyWordResource_daySlot_key" ON "DailyWordResource"("daySlot");

-- Seed seven reusable resources, one for each weekday.
INSERT INTO "DailyWordResource" ("id", "daySlot", "word", "phonetic", "category", "imageAlt", "imageFile", "audioFile", "updatedAt") VALUES
  ('daily-egret', 1, 'egret', '/ˈiː.ɡrət/', 'bird', '浅水湿地里的白鹭', 'egret.webp', 'daily_daily-egret.wav', CURRENT_TIMESTAMP),
  ('daily-fern', 2, 'fern', '/fɜːn/', 'plant', '晨光里舒展的蕨类植物', 'fern.webp', 'daily_daily-fern.wav', CURRENT_TIMESTAMP),
  ('daily-fox', 3, 'fox', '/fɒks/', 'land', '薄雾草地上的赤狐', 'fox.webp', 'daily_daily-fox.wav', CURRENT_TIMESTAMP),
  ('daily-dolphin', 4, 'dolphin', '/ˈdɒl.fɪn/', 'marine', '浅海中游动的宽吻海豚', 'dolphin.webp', 'daily_daily-dolphin.wav', CURRENT_TIMESTAMP),
  ('daily-swallow', 5, 'swallow', '/ˈswɒl.əʊ/', 'bird', '春日天空中飞翔的燕子', 'swallow.webp', 'daily_daily-swallow.wav', CURRENT_TIMESTAMP),
  ('daily-deer', 6, 'deer', '/dɪə/', 'land', '林缘晨雾中的小鹿', 'deer.webp', 'daily_daily-deer.wav', CURRENT_TIMESTAMP),
  ('daily-turtle', 7, 'turtle', '/ˈtɜː.təl/', 'marine', '浅海沙地上方游动的海龟', 'turtle.webp', 'daily_daily-turtle.wav', CURRENT_TIMESTAMP);

-- The selected visual replaces the former purple default for existing users.
UPDATE "User"
SET "themePreset" = 'macaron', "themeCustom" = NULL
WHERE "themePreset" IS NULL OR "themePreset" = 'purple';
