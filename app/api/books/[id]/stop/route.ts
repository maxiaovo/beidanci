import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requestStop } from "@/lib/import-runner";

// 停止导入：排队中的书直接移出队列，处理中的书在当前 AI 调用结束后停止
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const book = await prisma.book.findUnique({ where: { id } });
  if (!book) return NextResponse.json({ error: "单词书不存在" }, { status: 404 });
  if (book.ownerId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }
  if (book.status !== "queued" && book.status !== "processing") {
    return NextResponse.json({ error: "该书不在导入中" }, { status: 400 });
  }

  requestStop(id);
  return NextResponse.json({ ok: true });
}
