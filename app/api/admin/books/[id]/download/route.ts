import { NextResponse } from "next/server";
import fs from "fs";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { buildPackage } from "@/lib/package-book";

// 管理员一键下载词书资产包（单词发音 + 例句朗读 + words.csv 索引）
// 每次下载都重新打包，保证与当前音频一致
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const { id } = await params;
  const book = await prisma.book.findUnique({ where: { id } });
  if (!book) return NextResponse.json({ error: "词书不存在" }, { status: 404 });

  try {
    const zipPath = await buildPackage(id);
    const buf = fs.readFileSync(zipPath);
    const safeName = book.name.replace(/[\\/:*?"<>|]/g, "_");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="book.zip"; filename*=UTF-8''${encodeURIComponent(safeName)}.zip`,
        "Content-Length": String(buf.length),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "打包失败" }, { status: 400 });
  }
}
