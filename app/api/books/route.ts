import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";
import { bookVisibleWhere } from "@/lib/book-access";
import { MAX_STAGE } from "@/lib/scheduler";

// 我的单词书列表（含被分配的）+ 每本进度
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });

  const books = await prisma.book.findMany({
    where: bookVisibleWhere(user.id),
    orderBy: { createdAt: "asc" },
    include: {
      units: { include: { _count: { select: { words: true } } } },
      bookEnrollments: { where: { userId: user.id }, select: { id: true } },
    },
  });

  const bookIds = books.map((b) => b.id);
  // 进度聚合：一次查询取出当前用户在这些书里的全部 WordProgress，JS 里按书聚合，避免按书 N+1
  const progresses = bookIds.length
    ? await prisma.wordProgress.findMany({
        where: { userId: user.id, word: { unit: { bookId: { in: bookIds } } } },
        select: { stage: true, word: { select: { unit: { select: { bookId: true } } } } },
      })
    : [];
  const statsByBook = new Map<string, { learned: number; mastered: number }>();
  for (const p of progresses) {
    const bookId = p.word.unit.bookId;
    const s = statsByBook.get(bookId) ?? { learned: 0, mastered: 0 };
    s.learned++;
    if (p.stage >= MAX_STAGE) s.mastered++;
    statsByBook.set(bookId, s);
  }

  const result = books.map((b) => {
    const total = b.units.reduce((sum, u) => sum + u._count.words, 0);
    const stats = statsByBook.get(b.id) ?? { learned: 0, mastered: 0 };
    return {
      id: b.id,
      name: b.name,
      status: b.status,
      audioDone: b.audioDone,
      audioTotal: b.audioTotal,
      analyzeDone: b.analyzeDone,
      analyzeTotal: b.analyzeTotal,
      sharedWithAll: b.sharedWithAll,
      mine: b.ownerId === user.id,
      enrolled: b.bookEnrollments.length > 0,
      hasCover: !!b.coverFile,
      createdAt: b.createdAt,
      total,
      learned: stats.learned,
      mastered: stats.mastered,
      units: b.units.length,
    };
  });
  return NextResponse.json({ books: result });
}
