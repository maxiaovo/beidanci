// 网站图标存储：data/site/icon.{ext}
import fs from "fs";
import path from "path";

export const SITE_DIR = path.join(process.cwd(), "data", "site");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

const MAX_SIZE = 2 * 1024 * 1024;

export async function saveSiteIcon(file: File): Promise<string> {
  const ext = EXT_BY_MIME[file.type];
  if (!ext) throw new Error("图标只支持 png / ico / svg / jpg / webp / gif");
  if (file.size > MAX_SIZE) throw new Error("图标不能超过 2MB");
  fs.mkdirSync(SITE_DIR, { recursive: true });
  // 清掉旧图标（可能扩展名不同）
  for (const e of Object.values(EXT_BY_MIME)) {
    const old = path.join(SITE_DIR, `icon.${e}`);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }
  const fileName = `icon.${ext}`;
  fs.writeFileSync(path.join(SITE_DIR, fileName), Buffer.from(await file.arrayBuffer()));
  return fileName;
}

export function findSiteIcon(): { path: string; mime: string } | null {
  for (const [mime, ext] of Object.entries(EXT_BY_MIME)) {
    const p = path.join(SITE_DIR, `icon.${ext}`);
    if (fs.existsSync(p)) return { path: p, mime };
  }
  return null;
}
