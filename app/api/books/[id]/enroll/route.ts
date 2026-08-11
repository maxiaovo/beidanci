import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canLearn, getSessionUser } from "@/lib/session";
import { bookVisibleWhere } from "@/lib/book-access";

// 加入学习：可见的书才能加入；幂等
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canLearn(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const { id } = await params;

  const book = await prisma.book.findFirst({
    where: { id, ...bookVisibleWhere(user.id) },
    select: { id: true },
  });
  if (!book) return NextResponse.json({ error: "单词书不存在或无权限" }, { status: 404 });

  // SQLite 不支持 skipDuplicates，先查再插实现幂等
  const existing = await prisma.bookEnrollment.findUnique({
    where: { userId_bookId: { userId: user.id, bookId: id } },
  });
  if (!existing) {
    await prisma.bookEnrollment.create({ data: { userId: user.id, bookId: id } });
  }
  return NextResponse.json({ ok: true });
}

// 移出学习：删除在学关系与该书的每日计划；学习记录（WordProgress）保留，
// 已学词的到期复习照常出现，重新加入后进度还在
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canLearn(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const { id } = await params;

  await prisma.$transaction([
    prisma.bookEnrollment.deleteMany({ where: { userId: user.id, bookId: id } }),
    prisma.bookPlan.deleteMany({ where: { userId: user.id, bookId: id } }),
  ]);
  return NextResponse.json({ ok: true });
}
