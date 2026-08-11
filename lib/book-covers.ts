import fs from "fs";
import path from "path";

// 单词书封皮：由导入该书的用户（或管理员）上传，存于 data/covers/；
// 未上传时前端用文字封皮兜底，服务端不生成图片。
export const BOOK_COVER_DIR = path.join(process.cwd(), "data", "covers");

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

const MAX_COVER_SIZE = 8 * 1024 * 1024;

export function findBookCover(fileName: string): { path: string; mime: string } | null {
  const base = path.basename(fileName);
  const ext = path.extname(base).slice(1).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime || base !== fileName) return null;

  const full = path.join(BOOK_COVER_DIR, base);
  if (fs.existsSync(full)) return { path: full, mime };
  return null;
}

// 校验封皮文件，返回错误文案（null 表示合法）；在创建书籍记录前先校验，避免半成品状态
export function validateCover(file: File): string | null {
  if (!EXT_BY_MIME[file.type]) return "封皮只支持 jpg / png / webp";
  if (file.size > MAX_COVER_SIZE) return "封皮图片不能超过 8MB";
  return null;
}

// 保存上传的封皮，返回文件名；同时清理旧文件（同名书籍的上一张封皮）
export async function saveBookCover(
  bookId: string,
  file: File,
  previousFile?: string | null,
): Promise<string> {
  const invalid = validateCover(file);
  if (invalid) throw new Error(invalid);
  const ext = EXT_BY_MIME[file.type];

  fs.mkdirSync(BOOK_COVER_DIR, { recursive: true });
  const safeId = bookId.replace(/[^\w-]/g, "-");
  const fileName = `${safeId}-${Date.now()}.${ext}`;
  fs.writeFileSync(
    path.join(BOOK_COVER_DIR, fileName),
    Buffer.from(await file.arrayBuffer()),
  );

  deleteBookCover(previousFile);
  return fileName;
}

export function deleteBookCover(fileName?: string | null) {
  if (!fileName) return;
  const base = path.basename(fileName);
  if (base !== fileName) return;
  const full = path.join(BOOK_COVER_DIR, base);
  if (fs.existsSync(full)) {
    try {
      fs.unlinkSync(full);
    } catch { /* 文件可能已被清理，忽略 */ }
  }
}
