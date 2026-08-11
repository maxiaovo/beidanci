import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/session";
import { getImportStatus } from "@/lib/import-runner";
import { prisma } from "@/lib/db";

// 管理员查看导入实况：当前队列状态 + 最近解析出的单词 / 音频生成详情
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
  const status = getImportStatus();
  let currentBook: { id: string; name: string; analyzeDone: number; analyzeTotal: number; audioDone: number; audioTotal: number; status: string } | null = null;
  if (status.currentBookId) {
    const b = await prisma.book.findUnique({ where: { id: status.currentBookId } });
    if (b) {
      currentBook = {
        id: b.id,
        name: b.name,
        analyzeDone: b.analyzeDone,
        analyzeTotal: b.analyzeTotal,
        audioDone: b.audioDone,
        audioTotal: b.audioTotal,
        status: b.status,
      };
    }
  }
  return NextResponse.json({ ...status, currentBook });
}
