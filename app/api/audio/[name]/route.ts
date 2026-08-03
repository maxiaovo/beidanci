import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { AUDIO_DIR } from "@/lib/tts";
import { getSessionUser } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { name } = await params;
  const base = path.basename(name); // 防路径穿越
  if (!/^[\w.-]+\.wav$/.test(base)) {
    return NextResponse.json({ error: "非法文件名" }, { status: 400 });
  }
  const filePath = path.join(AUDIO_DIR, base);
  const bundledPath = path.join(process.cwd(), "public", "daily-nature", "audio", base);
  const resolvedPath = fs.existsSync(filePath)
    ? filePath
    : base.startsWith("daily_") && fs.existsSync(bundledPath)
      ? bundledPath
      : null;
  if (!resolvedPath) {
    return NextResponse.json({ error: "音频不存在" }, { status: 404 });
  }
  const buf = fs.readFileSync(resolvedPath);
  return new NextResponse(new Uint8Array(buf), {
    // URL 带 ?v= 版本号（lib/client.ts 的 AUDIO_VERSION），内容变更时版本号递增，故可永久缓存
    headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
