// 头像存储：data/avatars/{userId}.{ext}
import fs from "fs";
import path from "path";

export const AVATAR_DIR = path.join(process.cwd(), "data", "avatars");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MAX_SIZE = 5 * 1024 * 1024;

export async function saveAvatar(userId: string, file: File): Promise<string> {
  const ext = EXT_BY_MIME[file.type];
  if (!ext) throw new Error("头像只支持 jpg / png / webp / gif 图片");
  if (file.size > MAX_SIZE) throw new Error("头像不能超过 5MB");
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  // 清掉该用户旧头像（可能扩展名不同）
  for (const e of Object.values(EXT_BY_MIME)) {
    const old = path.join(AVATAR_DIR, `${userId}.${e}`);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }
  const fileName = `${userId}.${ext}`;
  fs.writeFileSync(path.join(AVATAR_DIR, fileName), Buffer.from(await file.arrayBuffer()));
  return fileName;
}

export function findAvatarFile(name: string): string | null {
  const base = path.basename(name);
  if (!/^[\w.-]+\.(jpg|png|webp|gif)$/.test(base)) return null;
  const p = path.join(AVATAR_DIR, base);
  return fs.existsSync(p) ? p : null;
}
