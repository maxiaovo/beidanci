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
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "音频不存在" }, { status: 404 });
  }
  const buf = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" },
  });
}
