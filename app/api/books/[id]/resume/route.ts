import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";
import { resumeImport } from "@/lib/import-runner";

// 断点续传：从上次中断处继续导入（已入库的单元和已生成的音频会跳过，只补缺失部分）
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const { id } = await params;

  const book = await prisma.book.findUnique({ where: { id } });
  if (!book) return NextResponse.json({ error: "单词书不存在" }, { status: 404 });
  if (book.ownerId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }
  if (book.status === "queued" || book.status === "processing") {
    return NextResponse.json({ ok: true, message: "该书已在导入队列中" });
  }

  const r = await resumeImport(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
