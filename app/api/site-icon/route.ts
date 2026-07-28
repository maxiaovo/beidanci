import { NextResponse } from "next/server";
import fs from "fs";
import { findSiteIcon } from "@/lib/site";

// 网站图标（公开）：有自定义图标则返回，否则 404（前端回落到 /favicon.ico）
export async function GET() {
  const icon = findSiteIcon();
  if (!icon) return NextResponse.json({ error: "未设置图标" }, { status: 404 });
  const buf = fs.readFileSync(icon.path);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": icon.mime, "Cache-Control": "public, max-age=300" },
  });
}
