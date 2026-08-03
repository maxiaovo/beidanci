import fs from "fs";
import path from "path";

export const DAILY_WORD_IMAGE_DIR = path.join(process.cwd(), "data", "daily-words");
export const BUNDLED_DAILY_WORD_IMAGE_DIR = path.join(process.cwd(), "public", "daily-nature");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

export function weekdaySlot(dateText?: string | null): number {
  const valid = dateText && /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? dateText : null;
  const day = valid
    ? new Date(`${valid}T12:00:00Z`).getUTCDay()
    : new Date().getDay();
  return day === 0 ? 7 : day;
}

export function findDailyWordImage(fileName: string): { path: string; mime: string } | null {
  const base = path.basename(fileName);
  const ext = path.extname(base).slice(1).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime || base !== fileName) return null;

  const override = path.join(DAILY_WORD_IMAGE_DIR, base);
  if (fs.existsSync(override)) return { path: override, mime };

  const bundled = path.join(BUNDLED_DAILY_WORD_IMAGE_DIR, base);
  if (fs.existsSync(bundled)) return { path: bundled, mime };
  return null;
}

export async function saveDailyWordImage(
  resourceId: string,
  file: File,
  previousFile?: string | null,
): Promise<string> {
  const ext = EXT_BY_MIME[file.type];
  if (!ext) throw new Error("图片只支持 jpg / png / webp");
  if (file.size > MAX_IMAGE_SIZE) throw new Error("图片不能超过 8MB");

  fs.mkdirSync(DAILY_WORD_IMAGE_DIR, { recursive: true });
  const safeId = resourceId.replace(/[^\w-]/g, "-");
  const fileName = `${safeId}-${Date.now()}.${ext}`;
  fs.writeFileSync(
    path.join(DAILY_WORD_IMAGE_DIR, fileName),
    Buffer.from(await file.arrayBuffer()),
  );

  if (previousFile) {
    const previousBase = path.basename(previousFile);
    const previousPath = path.join(DAILY_WORD_IMAGE_DIR, previousBase);
    if (previousBase === previousFile && fs.existsSync(previousPath)) {
      fs.unlinkSync(previousPath);
    }
  }
  return fileName;
}
